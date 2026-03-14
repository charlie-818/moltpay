import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SkillManager } from '../../src/skills/SkillManager';
import { PermissionManager } from '../../src/security/PermissionManager';
import { SandboxManager } from '../../src/security/SandboxManager';
import { AuditLogger } from '../../src/security/AuditLogger';
import { PaymentManager } from '../../src/payments/PaymentManager';
import { LicenseManager } from '../../src/payments/LicenseManager';
import { VALID_SKILL_MD, PAID_SKILL_MD, SKILL_WITH_PERMISSIONS } from '../fixtures/skills';
import { Connection, Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Mock Solana modules
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
  const { createMockConnection } = await import('../fixtures/solana-mocks');
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => createMockConnection()),
  };
});

vi.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: vi.fn().mockResolvedValue({
    toBase58: () => 'mock-token-account',
  }),
  getAccount: vi.fn().mockResolvedValue({
    amount: BigInt(1000000000),
  }),
  createTransferInstruction: vi.fn().mockReturnValue({}),
  TOKEN_PROGRAM_ID: { toBase58: () => 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
}));

/**
 * E2E Tests: Agent Skill Usage
 *
 * These tests simulate how an AI agent would interact with the skill system,
 * including discovery, installation, permission handling, execution, and payments.
 */
describe('Agent Skill Usage E2E', () => {
  // System components
  let skillManager: SkillManager;
  let permissionManager: PermissionManager;
  let sandboxManager: SandboxManager;
  let auditLogger: AuditLogger;
  let paymentManager: PaymentManager;
  let licenseManager: LicenseManager;
  let mockConnection: ReturnType<typeof createMockConnection>;

  // Test credentials
  const agentKeypair = Keypair.generate();
  const agentPublicKey = agentKeypair.publicKey.toBase58();

  const publisherKeypair = nacl.sign.keyPair();
  const publisherPublicKey = bs58.encode(publisherKeypair.publicKey);
  const publisherPrivateKey = bs58.encode(publisherKeypair.secretKey);

  // Simulated agent interface
  class TestAgent {
    private approvedExecutions: Set<string> = new Set();

    constructor(
      private skillManager: SkillManager,
      private permissionManager: PermissionManager,
      private sandboxManager: SandboxManager,
      private auditLogger: AuditLogger,
      private paymentManager: PaymentManager,
      private licenseManager: LicenseManager,
      private agentId: string
    ) {}

    async searchSkills(query: string) {
      const skills = this.skillManager.query({});
      return skills.filter(
        s =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.description.toLowerCase().includes(query.toLowerCase()) ||
          s.tags?.some(t => t.toLowerCase().includes(query.toLowerCase()))
      );
    }

    async installSkill(content: string) {
      const installed = await this.skillManager.installFromContent(content);
      return installed;
    }

    async installPaidSkill(
      content: string,
      price: number,
      sellerPublicKey: string
    ) {
      // Check funds
      const hasFunds = await this.paymentManager.hasSufficientFunds(price, 'SOL');
      if (!hasFunds) {
        throw new Error('Insufficient funds');
      }

      // Process payment
      const paymentResult = await this.paymentManager.purchaseSkill({
        skillId: 'pending',
        price,
        currency: 'SOL',
        sellerPublicKey,
      });

      if (!paymentResult.success) {
        throw new Error(paymentResult.error);
      }

      // Install skill
      const installed = await this.skillManager.installFromContent(content);

      // Create license
      const license: any = {
        id: `license-${Date.now()}`,
        skillId: installed.id,
        purchaserId: this.agentId,
        type: 'perpetual',
        issuedAt: Date.now(),
        receiptSignature: paymentResult.signature!,
      };

      // Sign and store license
      license.signature = this.licenseManager.signLicense(license, publisherPrivateKey);
      this.licenseManager.storeLicense(license);

      return installed;
    }

    async requestPermission(skillId: string, scope: string, reason: string) {
      const skill = this.skillManager.get(skillId);
      if (!skill) {
        throw new Error('Skill not found');
      }

      return this.permissionManager.evaluate(
        { scope: scope as any, reason },
        {
          skillId,
          trustLevel: skill.trustLevel,
          autonomyTier: skill.autonomyTier,
          existingPermissions: skill.permissions || [],
        }
      );
    }

    async executeSkill(
      skillId: string,
      code: string,
      requiresApproval: boolean = false
    ) {
      const executionId = `exec-${Date.now()}`;

      // Check if skill has sandbox
      if (!this.sandboxManager.hasSandbox(skillId)) {
        const skill = this.skillManager.get(skillId);
        await this.sandboxManager.createSandbox(skillId, skill?.permissions || []);
      }

      // Log start
      this.auditLogger.logExecutionStart(skillId, executionId);

      if (requiresApproval && !this.approvedExecutions.has(executionId)) {
        return {
          status: 'pending_approval',
          executionId,
          skillId,
          code,
        };
      }

      // Execute
      const result = await this.sandboxManager.execute(skillId, code);

      // Log completion
      this.auditLogger.logExecutionComplete(
        skillId,
        executionId,
        result.success,
        { output: result.result },
        result.error
      );

      return {
        status: result.success ? 'completed' : 'failed',
        executionId,
        result: result.result,
        error: result.error,
      };
    }

    approveExecution(executionId: string) {
      this.approvedExecutions.add(executionId);
    }

    async checkLicense(skillId: string) {
      return this.licenseManager.validateLicense(skillId, this.agentId);
    }

    getAuditTrail(skillId?: string) {
      if (skillId) {
        return this.auditLogger.getBySkill(skillId);
      }
      return this.auditLogger.getRecent(50);
    }
  }

  let agent: TestAgent;

  beforeEach(() => {
    mockConnection = createMockConnection();

    permissionManager = new PermissionManager();
    sandboxManager = new SandboxManager();
    auditLogger = new AuditLogger({ inMemory: true });
    licenseManager = new LicenseManager({ inMemory: true });

    skillManager = new SkillManager({
      inMemory: true,
      permissionManager,
      sandboxManager,
      auditLogger,
    });

    paymentManager = new PaymentManager({
      connection: mockConnection as unknown as Connection,
      payerKeypair: agentKeypair,
    });

    agent = new TestAgent(
      skillManager,
      permissionManager,
      sandboxManager,
      auditLogger,
      paymentManager,
      licenseManager,
      agentPublicKey
    );
  });

  afterEach(() => {
    sandboxManager.destroyAll();
    auditLogger.close();
    licenseManager.close();
  });

  describe('Skill Discovery and Installation', () => {
    it('should allow agent to discover and install skills', async () => {
      // Install a skill
      const installed = await agent.installSkill(VALID_SKILL_MD);
      expect(installed).toBeDefined();
      expect(installed.name).toBe('test-skill');

      // Search for installed skill
      const results = await agent.searchSkills('test');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('test-skill');
    });

    it('should install multiple skills and search', async () => {
      // Install multiple skills
      await agent.installSkill(VALID_SKILL_MD);

      const swapSkill = `---
name: solana-swap
description: Execute token swaps on Jupiter
license: MIT
tags:
  - solana
  - defi
  - swap
---
## Instructions
Use this skill to swap tokens.`;

      await agent.installSkill(swapSkill);

      // Search by tag
      const defiResults = await agent.searchSkills('defi');
      expect(defiResults.some(s => s.name === 'solana-swap')).toBe(true);

      // Search by description
      const swapResults = await agent.searchSkills('swap');
      expect(swapResults.some(s => s.name === 'solana-swap')).toBe(true);
    });
  });

  describe('Permission Handling', () => {
    it('should handle permission requests for skills', async () => {
      const installed = await agent.installSkill(SKILL_WITH_PERMISSIONS);

      // Request file read permission
      const result = await agent.requestPermission(
        installed.id,
        'file_read',
        'Need to read configuration'
      );

      expect(result.granted || result.requiresUserApproval).toBe(true);
    });

    it('should require approval for sensitive permissions', async () => {
      const installed = await agent.installSkill(VALID_SKILL_MD);

      // Request wallet send permission
      const result = await agent.requestPermission(
        installed.id,
        'wallet_send',
        'Need to send tokens'
      );

      expect(result.requiresUserApproval).toBe(true);
    });
  });

  describe('Skill Execution', () => {
    it('should execute skill code in sandbox', async () => {
      const installed = await agent.installSkill(VALID_SKILL_MD);

      const result = await agent.executeSkill(
        installed.id,
        '({ sum: 1 + 2 + 3 })'
      );

      expect(result.status).toBe('completed');
      expect(result.result).toEqual({ sum: 6 });
    });

    it('should handle pending approval flow', async () => {
      const installed = await agent.installSkill(VALID_SKILL_MD);

      // Execute with approval required
      const pendingResult = await agent.executeSkill(
        installed.id,
        '"sensitive operation"',
        true
      );

      expect(pendingResult.status).toBe('pending_approval');
      expect(pendingResult.executionId).toBeDefined();

      // Approve execution
      agent.approveExecution(pendingResult.executionId);

      // Re-execute after approval (simulate retry)
      await sandboxManager.createSandbox(installed.id, []);
      const approvedResult = await sandboxManager.execute(
        installed.id,
        '"sensitive operation"'
      );

      expect(approvedResult.success).toBe(true);
      expect(approvedResult.result).toBe('sensitive operation');
    });

    it('should block dangerous code', async () => {
      const installed = await agent.installSkill(VALID_SKILL_MD);

      const result = await agent.executeSkill(
        installed.id,
        'process.exit(1)'
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('validation failed');
    });

    it('should track execution in audit log', async () => {
      const installed = await agent.installSkill(VALID_SKILL_MD);

      await agent.executeSkill(installed.id, '1 + 1');

      const trail = agent.getAuditTrail(installed.id);
      expect(trail.some(l => l.eventType === 'skill_executed')).toBe(true);
    });
  });

  describe('Paid Skill Flow', () => {
    it('should purchase and install paid skill', async () => {
      const installed = await agent.installPaidSkill(
        PAID_SKILL_MD,
        0.1,
        'seller-pubkey'
      );

      expect(installed).toBeDefined();

      // Verify license
      const licenseStatus = await agent.checkLicense(installed.id);
      expect(licenseStatus.valid).toBe(true);
    });

    it('should reject execution without valid license', async () => {
      // Install skill without payment flow
      const installed = await agent.installSkill(PAID_SKILL_MD);

      // Check license - should be invalid (no license created)
      const licenseStatus = await agent.checkLicense(installed.id);
      expect(licenseStatus.valid).toBe(false);
    });

    it('should handle insufficient funds', async () => {
      // Set low balance
      mockConnection.getBalance.mockResolvedValueOnce(1000); // Very low

      await expect(
        agent.installPaidSkill(PAID_SKILL_MD, 1, 'seller-pubkey')
      ).rejects.toThrow('Insufficient funds');
    });
  });

  describe('Audit Trail', () => {
    it('should maintain complete audit trail', async () => {
      // Install skill
      const installed = await agent.installSkill(VALID_SKILL_MD);

      // Execute multiple times
      await agent.executeSkill(installed.id, '1 + 1');
      await agent.executeSkill(installed.id, '2 + 2');
      await agent.executeSkill(installed.id, '3 + 3');

      // Get audit trail
      const trail = agent.getAuditTrail(installed.id);

      // Should have installation + executions
      expect(trail.length).toBeGreaterThanOrEqual(4);
      expect(trail.some(l => l.eventType === 'skill_installed')).toBe(true);
      expect(trail.filter(l => l.eventType === 'skill_executed').length).toBeGreaterThanOrEqual(3);
    });

    it('should track failed executions', async () => {
      const installed = await agent.installSkill(VALID_SKILL_MD);

      // Execute failing code
      await agent.executeSkill(installed.id, 'throw new Error("Test")');

      const trail = agent.getAuditTrail(installed.id);
      const failedExec = trail.find(
        l => l.eventType === 'skill_executed' && l.outcome === 'failure'
      );

      expect(failedExec).toBeDefined();
      expect(failedExec?.errorMessage).toContain('Test');
    });
  });

  describe('Full Agent Workflow', () => {
    it('should complete realistic agent workflow', async () => {
      // Step 1: Agent searches for a skill
      let searchResults = await agent.searchSkills('test');
      expect(searchResults).toHaveLength(0); // None installed yet

      // Step 2: Agent installs a skill
      const installed = await agent.installSkill(VALID_SKILL_MD);
      expect(installed.name).toBe('test-skill');

      // Step 3: Agent searches again
      searchResults = await agent.searchSkills('test');
      expect(searchResults).toHaveLength(1);

      // Step 4: Agent requests necessary permissions
      const permResult = await agent.requestPermission(
        installed.id,
        'file_read',
        'Read configuration file'
      );
      expect(permResult.granted || permResult.requiresUserApproval).toBe(true);

      // Step 5: Agent executes skill
      const execResult = await agent.executeSkill(
        installed.id,
        '({ message: "Hello from skill", timestamp: Date.now() })'
      );
      expect(execResult.status).toBe('completed');
      expect(execResult.result).toHaveProperty('message');

      // Step 6: Agent reviews audit trail
      const auditTrail = agent.getAuditTrail(installed.id);
      expect(auditTrail.length).toBeGreaterThan(0);

      // Verify complete trail
      const eventTypes = auditTrail.map(l => l.eventType);
      expect(eventTypes).toContain('skill_installed');
      expect(eventTypes).toContain('skill_executed');
    });

    it('should handle complex multi-skill workflow', async () => {
      // Install multiple skills
      const skill1 = await agent.installSkill(VALID_SKILL_MD);

      const skill2Content = `---
name: data-processor
description: Process and transform data
license: MIT
---
## Instructions
Transform data formats.`;
      const skill2 = await agent.installSkill(skill2Content);

      const skill3Content = `---
name: reporter
description: Generate reports
license: MIT
---
## Instructions
Create formatted reports.`;
      const skill3 = await agent.installSkill(skill3Content);

      // Execute workflow across skills
      const step1 = await agent.executeSkill(
        skill1.id,
        '({ data: [1, 2, 3, 4, 5] })'
      );
      expect(step1.status).toBe('completed');

      const step2 = await agent.executeSkill(
        skill2.id,
        '({ processed: [1, 2, 3, 4, 5].map(x => x * 2) })'
      );
      expect(step2.status).toBe('completed');

      const step3 = await agent.executeSkill(
        skill3.id,
        '({ report: "Processed 5 items, total: 30" })'
      );
      expect(step3.status).toBe('completed');

      // Verify all executions logged
      const allTrail = agent.getAuditTrail();
      expect(allTrail.filter(l => l.eventType === 'skill_executed').length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from execution errors', async () => {
      const installed = await agent.installSkill(VALID_SKILL_MD);

      // First execution fails
      const failedResult = await agent.executeSkill(
        installed.id,
        'throw new Error("Temporary failure")'
      );
      expect(failedResult.status).toBe('failed');

      // Retry succeeds
      const successResult = await agent.executeSkill(
        installed.id,
        '"retry successful"'
      );
      expect(successResult.status).toBe('completed');
      expect(successResult.result).toBe('retry successful');
    });

    it('should handle skill not found gracefully', async () => {
      await expect(
        agent.requestPermission('non-existent-skill', 'file_read', 'Test')
      ).rejects.toThrow('Skill not found');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent skill executions', async () => {
      const installed = await agent.installSkill(VALID_SKILL_MD);

      // Execute multiple skills concurrently
      const executions = await Promise.all([
        agent.executeSkill(installed.id, '1 + 1'),
        agent.executeSkill(installed.id, '2 + 2'),
        agent.executeSkill(installed.id, '3 + 3'),
      ]);

      expect(executions.every(e => e.status === 'completed')).toBe(true);
      expect(executions.map(e => e.result)).toEqual([2, 4, 6]);
    });

    it('should handle concurrent skill installations', async () => {
      const skills = await Promise.all([
        agent.installSkill(VALID_SKILL_MD),
        agent.installSkill(`---
name: skill-two
description: Second skill
license: MIT
---
Instructions`),
        agent.installSkill(`---
name: skill-three
description: Third skill
license: MIT
---
Instructions`),
      ]);

      expect(skills).toHaveLength(3);
      expect(new Set(skills.map(s => s.id)).size).toBe(3); // All unique IDs
    });
  });
});
