import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SkillManager } from '../../src/skills/SkillManager';
import { PermissionManager } from '../../src/security/PermissionManager';
import { SandboxManager } from '../../src/security/SandboxManager';
import { AuditLogger } from '../../src/security/AuditLogger';
import { PaymentManager } from '../../src/payments/PaymentManager';
import { createMockConnection } from '../fixtures/solana-mocks';
import { VALID_SKILL_MD } from '../fixtures/skills';
import { Connection, Keypair } from '@solana/web3.js';

// Mock Solana modules
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
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
}));

/**
 * LangChain Integration Tests
 *
 * These tests verify that moltpay can be used as a LangChain-compatible tool,
 * following the LangChain tool interface patterns.
 */

// LangChain-style tool interface
interface LangChainToolInput {
  action: string;
  [key: string]: any;
}

interface LangChainToolResult {
  output: string;
  success: boolean;
  data?: any;
}

/**
 * MoltPayTool - LangChain-compatible wrapper for moltpay functionality
 */
class MoltPayTool {
  name = 'moltpay';
  description = 'A tool for managing skills, payments, and AI agent capabilities on Solana';

  constructor(
    private skillManager: SkillManager,
    private paymentManager: PaymentManager,
    private permissionManager: PermissionManager,
    private sandboxManager: SandboxManager,
    private auditLogger: AuditLogger
  ) {}

  async invoke(input: LangChainToolInput): Promise<LangChainToolResult> {
    try {
      switch (input.action) {
        case 'list_skills':
          return this.listSkills(input);

        case 'install_skill':
          return this.installSkill(input);

        case 'uninstall_skill':
          return this.uninstallSkill(input);

        case 'execute_skill':
          return this.executeSkill(input);

        case 'get_balance':
          return this.getBalance(input);

        case 'send_sol':
          return this.sendSol(input);

        case 'get_audit_log':
          return this.getAuditLog(input);

        default:
          return {
            output: `Unknown action: ${input.action}`,
            success: false,
          };
      }
    } catch (error: any) {
      return {
        output: `Error: ${error.message}`,
        success: false,
      };
    }
  }

  private async listSkills(input: LangChainToolInput): Promise<LangChainToolResult> {
    const skills = this.skillManager.query({
      enabled: input.enabled,
    });

    return {
      output: `Found ${skills.length} skills`,
      success: true,
      data: skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        enabled: s.enabled,
      })),
    };
  }

  private async installSkill(input: LangChainToolInput): Promise<LangChainToolResult> {
    if (!input.content) {
      return {
        output: 'Missing skill content',
        success: false,
      };
    }

    const installed = await this.skillManager.installFromContent(input.content);

    return {
      output: `Installed skill: ${installed.name}`,
      success: true,
      data: {
        id: installed.id,
        name: installed.name,
      },
    };
  }

  private async uninstallSkill(input: LangChainToolInput): Promise<LangChainToolResult> {
    if (!input.skillId) {
      return {
        output: 'Missing skillId',
        success: false,
      };
    }

    this.skillManager.uninstall(input.skillId);

    return {
      output: `Uninstalled skill: ${input.skillId}`,
      success: true,
    };
  }

  private async executeSkill(input: LangChainToolInput): Promise<LangChainToolResult> {
    if (!input.skillId || !input.code) {
      return {
        output: 'Missing skillId or code',
        success: false,
      };
    }

    // Ensure sandbox exists
    if (!this.sandboxManager.hasSandbox(input.skillId)) {
      const skill = this.skillManager.get(input.skillId);
      if (!skill) {
        return {
          output: `Skill not found: ${input.skillId}`,
          success: false,
        };
      }
      await this.sandboxManager.createSandbox(input.skillId, skill.permissions || []);
    }

    const result = await this.sandboxManager.execute(input.skillId, input.code);

    if (result.success) {
      return {
        output: `Execution completed`,
        success: true,
        data: result.result,
      };
    } else {
      return {
        output: `Execution failed: ${result.error}`,
        success: false,
      };
    }
  }

  private async getBalance(input: LangChainToolInput): Promise<LangChainToolResult> {
    const balance = await this.paymentManager.getSolBalance();

    return {
      output: `Balance: ${balance} SOL`,
      success: true,
      data: { balance, currency: 'SOL' },
    };
  }

  private async sendSol(input: LangChainToolInput): Promise<LangChainToolResult> {
    if (!input.to || !input.amount) {
      return {
        output: 'Missing to or amount',
        success: false,
      };
    }

    const result = await this.paymentManager.purchaseSkill({
      skillId: 'direct-transfer',
      price: input.amount,
      currency: 'SOL',
      sellerPublicKey: input.to,
    });

    if (result.success) {
      return {
        output: `Sent ${input.amount} SOL to ${input.to}`,
        success: true,
        data: { signature: result.signature },
      };
    } else {
      return {
        output: `Transfer failed: ${result.error}`,
        success: false,
      };
    }
  }

  private async getAuditLog(input: LangChainToolInput): Promise<LangChainToolResult> {
    const logs = input.skillId
      ? this.auditLogger.getBySkill(input.skillId, input.limit || 10)
      : this.auditLogger.getRecent(input.limit || 10);

    return {
      output: `Retrieved ${logs.length} audit entries`,
      success: true,
      data: logs,
    };
  }
}

describe('LangChain Integration E2E', () => {
  let skillManager: SkillManager;
  let paymentManager: PaymentManager;
  let permissionManager: PermissionManager;
  let sandboxManager: SandboxManager;
  let auditLogger: AuditLogger;
  let moltPayTool: MoltPayTool;
  let mockConnection: ReturnType<typeof createMockConnection>;

  const testKeypair = Keypair.generate();

  beforeEach(() => {
    mockConnection = createMockConnection();

    permissionManager = new PermissionManager();
    sandboxManager = new SandboxManager();
    auditLogger = new AuditLogger({ inMemory: true });

    skillManager = new SkillManager({
      inMemory: true,
      permissionManager,
      sandboxManager,
      auditLogger,
    });

    paymentManager = new PaymentManager({
      connection: mockConnection as unknown as Connection,
      payerKeypair: testKeypair,
    });

    moltPayTool = new MoltPayTool(
      skillManager,
      paymentManager,
      permissionManager,
      sandboxManager,
      auditLogger
    );
  });

  afterEach(() => {
    sandboxManager.destroyAll();
    auditLogger.close();
  });

  describe('Tool Metadata', () => {
    it('should have correct tool name and description', () => {
      expect(moltPayTool.name).toBe('moltpay');
      expect(moltPayTool.description).toContain('skills');
      expect(moltPayTool.description).toContain('payments');
    });
  });

  describe('list_skills Action', () => {
    it('should list all skills', async () => {
      // Install some skills first
      await skillManager.installFromContent(VALID_SKILL_MD);

      const result = await moltPayTool.invoke({
        action: 'list_skills',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('test-skill');
    });

    it('should filter by enabled status', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);
      skillManager.setEnabled(installed.id, false);

      const enabledResult = await moltPayTool.invoke({
        action: 'list_skills',
        enabled: true,
      });

      expect(enabledResult.success).toBe(true);
      expect(enabledResult.data.every((s: any) => s.enabled)).toBe(true);
    });
  });

  describe('install_skill Action', () => {
    it('should install skill from content', async () => {
      const result = await moltPayTool.invoke({
        action: 'install_skill',
        content: VALID_SKILL_MD,
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('test-skill');
      expect(result.output).toContain('Installed skill');
    });

    it('should fail without content', async () => {
      const result = await moltPayTool.invoke({
        action: 'install_skill',
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing skill content');
    });
  });

  describe('uninstall_skill Action', () => {
    it('should uninstall skill', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      const result = await moltPayTool.invoke({
        action: 'uninstall_skill',
        skillId: installed.id,
      });

      expect(result.success).toBe(true);
      expect(skillManager.get(installed.id)).toBeNull();
    });

    it('should fail without skillId', async () => {
      const result = await moltPayTool.invoke({
        action: 'uninstall_skill',
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing skillId');
    });
  });

  describe('execute_skill Action', () => {
    it('should execute skill code', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      const result = await moltPayTool.invoke({
        action: 'execute_skill',
        skillId: installed.id,
        code: '1 + 2 + 3',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(6);
    });

    it('should handle execution errors', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      const result = await moltPayTool.invoke({
        action: 'execute_skill',
        skillId: installed.id,
        code: 'throw new Error("Test")',
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('Test');
    });

    it('should block dangerous code', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      const result = await moltPayTool.invoke({
        action: 'execute_skill',
        skillId: installed.id,
        code: 'process.exit(1)',
      });

      expect(result.success).toBe(false);
    });

    it('should fail for non-existent skill', async () => {
      const result = await moltPayTool.invoke({
        action: 'execute_skill',
        skillId: 'non-existent',
        code: '1 + 1',
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });
  });

  describe('get_balance Action', () => {
    it('should return SOL balance', async () => {
      const result = await moltPayTool.invoke({
        action: 'get_balance',
      });

      expect(result.success).toBe(true);
      expect(result.data.balance).toBeGreaterThan(0);
      expect(result.data.currency).toBe('SOL');
    });
  });

  describe('send_sol Action', () => {
    it('should send SOL', async () => {
      const result = await moltPayTool.invoke({
        action: 'send_sol',
        to: 'recipient-pubkey',
        amount: 0.1,
      });

      expect(result.success).toBe(true);
      expect(result.data.signature).toBeDefined();
    });

    it('should fail without to address', async () => {
      const result = await moltPayTool.invoke({
        action: 'send_sol',
        amount: 0.1,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing to');
    });

    it('should fail with insufficient funds', async () => {
      mockConnection.getBalance.mockResolvedValueOnce(1000);

      const result = await moltPayTool.invoke({
        action: 'send_sol',
        to: 'recipient',
        amount: 100, // Way more than balance
      });

      expect(result.success).toBe(false);
    });
  });

  describe('get_audit_log Action', () => {
    it('should return audit log entries', async () => {
      // Create some audit entries
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      const result = await moltPayTool.invoke({
        action: 'get_audit_log',
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should filter by skillId', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      const result = await moltPayTool.invoke({
        action: 'get_audit_log',
        skillId: installed.id,
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data.every((l: any) => l.skillId === installed.id)).toBe(true);
    });
  });

  describe('Unknown Action', () => {
    it('should handle unknown actions', async () => {
      const result = await moltPayTool.invoke({
        action: 'unknown_action',
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown action');
    });
  });

  describe('LangChain Agent Simulation', () => {
    it('should work in simulated agent loop', async () => {
      // Simulates how a LangChain agent would use the tool

      // Step 1: Agent checks current skills
      let result = await moltPayTool.invoke({ action: 'list_skills' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);

      // Step 2: Agent installs a skill
      result = await moltPayTool.invoke({
        action: 'install_skill',
        content: VALID_SKILL_MD,
      });
      expect(result.success).toBe(true);
      const skillId = result.data.id;

      // Step 3: Agent verifies installation
      result = await moltPayTool.invoke({ action: 'list_skills' });
      expect(result.data).toHaveLength(1);

      // Step 4: Agent executes skill
      result = await moltPayTool.invoke({
        action: 'execute_skill',
        skillId,
        code: '({ greeting: "Hello from LangChain agent!" })',
      });
      expect(result.success).toBe(true);
      expect(result.data.greeting).toBe('Hello from LangChain agent!');

      // Step 5: Agent checks balance
      result = await moltPayTool.invoke({ action: 'get_balance' });
      expect(result.success).toBe(true);
      expect(result.data.balance).toBeGreaterThan(0);

      // Step 6: Agent reviews audit log
      result = await moltPayTool.invoke({
        action: 'get_audit_log',
        skillId,
      });
      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(2); // install + execute

      // Step 7: Agent cleans up
      result = await moltPayTool.invoke({
        action: 'uninstall_skill',
        skillId,
      });
      expect(result.success).toBe(true);
    });

    it('should handle multi-step workflow with data passing', async () => {
      // Install computation skill
      let result = await moltPayTool.invoke({
        action: 'install_skill',
        content: `---
name: calculator
description: Perform calculations
license: MIT
---
Calculator skill`,
      });
      const calcSkillId = result.data.id;

      // Install formatter skill
      result = await moltPayTool.invoke({
        action: 'install_skill',
        content: `---
name: formatter
description: Format data
license: MIT
---
Formatter skill`,
      });
      const formatSkillId = result.data.id;

      // Step 1: Calculate
      result = await moltPayTool.invoke({
        action: 'execute_skill',
        skillId: calcSkillId,
        code: '({ values: [1, 2, 3, 4, 5], sum: [1,2,3,4,5].reduce((a,b) => a+b, 0) })',
      });
      const calcData = result.data;
      expect(calcData.sum).toBe(15);

      // Step 2: Format the result (simulated data passing)
      result = await moltPayTool.invoke({
        action: 'execute_skill',
        skillId: formatSkillId,
        code: `({ formatted: "The sum of 5 numbers is: ${calcData.sum}" })`,
      });
      expect(result.data.formatted).toContain('15');

      // Cleanup
      await moltPayTool.invoke({ action: 'uninstall_skill', skillId: calcSkillId });
      await moltPayTool.invoke({ action: 'uninstall_skill', skillId: formatSkillId });
    });
  });

  describe('Error Handling', () => {
    it('should handle and report errors gracefully', async () => {
      // Force an error by installing invalid content
      const result = await moltPayTool.invoke({
        action: 'install_skill',
        content: 'not valid yaml frontmatter',
      });

      // Should not throw, should return error result
      expect(result.success).toBe(false);
      expect(result.output).toContain('Error');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent tool invocations', async () => {
      // Install a skill first
      const installResult = await moltPayTool.invoke({
        action: 'install_skill',
        content: VALID_SKILL_MD,
      });
      const skillId = installResult.data.id;

      // Execute multiple operations concurrently
      const results = await Promise.all([
        moltPayTool.invoke({ action: 'list_skills' }),
        moltPayTool.invoke({ action: 'get_balance' }),
        moltPayTool.invoke({
          action: 'execute_skill',
          skillId,
          code: '1 + 1',
        }),
        moltPayTool.invoke({
          action: 'execute_skill',
          skillId,
          code: '2 + 2',
        }),
        moltPayTool.invoke({ action: 'get_audit_log' }),
      ]);

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('Tool Chaining', () => {
    it('should support tool chaining patterns', async () => {
      // Pattern: Install -> Execute -> Log -> Uninstall

      const actions = [
        { action: 'install_skill', content: VALID_SKILL_MD },
      ];

      // Execute first action
      let result = await moltPayTool.invoke(actions[0]);
      expect(result.success).toBe(true);
      const skillId = result.data.id;

      // Chain execution
      result = await moltPayTool.invoke({
        action: 'execute_skill',
        skillId,
        code: '({ step: 1 })',
      });
      expect(result.success).toBe(true);

      // Check audit
      result = await moltPayTool.invoke({
        action: 'get_audit_log',
        skillId,
      });
      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);

      // Uninstall
      result = await moltPayTool.invoke({
        action: 'uninstall_skill',
        skillId,
      });
      expect(result.success).toBe(true);

      // Verify uninstalled
      result = await moltPayTool.invoke({ action: 'list_skills' });
      expect(result.data).toHaveLength(0);
    });
  });
});
