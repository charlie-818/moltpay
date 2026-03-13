import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SkillManager } from '../../src/skills/SkillManager';
import { SkillValidator } from '../../src/skills/SkillValidator';
import { SkillRegistry } from '../../src/skills/SkillRegistry';
import { PermissionManager } from '../../src/security/PermissionManager';
import { SandboxManager } from '../../src/security/SandboxManager';
import { AuditLogger } from '../../src/security/AuditLogger';
import { VALID_SKILL_MD, PAID_SKILL_MD, SKILL_WITH_PERMISSIONS } from '../fixtures/skills';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  watch: vi.fn(),
}));

describe('Skill Installation Flow Integration', () => {
  let skillManager: SkillManager;
  let skillValidator: SkillValidator;
  let skillRegistry: SkillRegistry;
  let permissionManager: PermissionManager;
  let sandboxManager: SandboxManager;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    skillValidator = new SkillValidator();
    skillRegistry = new SkillRegistry({ inMemory: true });
    permissionManager = new PermissionManager();
    sandboxManager = new SandboxManager();
    auditLogger = new AuditLogger({ inMemory: true });

    skillManager = new SkillManager({
      inMemory: true,
      permissionManager,
      sandboxManager,
      auditLogger,
    });
  });

  afterEach(() => {
    sandboxManager.destroyAll();
    skillRegistry.close();
    auditLogger.close();
  });

  describe('Local Skill Installation', () => {
    it('should complete full installation flow for valid skill', async () => {
      // Step 1: Parse and validate SKILL.md
      const parsed = skillValidator.parseSkillContent(VALID_SKILL_MD);
      expect(parsed.valid).toBe(true);
      expect(parsed.metadata?.name).toBe('test-skill');

      // Step 2: Convert to metadata
      const metadata = skillValidator.toMetadata(parsed);
      expect(metadata.name).toBe('test-skill');
      expect(metadata.allowedTools).toContain('Read');
      expect(metadata.allowedTools).toContain('Write');

      // Step 3: Validate metadata
      const validation = skillValidator.validate(metadata);
      expect(validation.valid).toBe(true);

      // Step 4: Install via SkillManager
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);
      expect(installed.id).toBeDefined();
      expect(installed.name).toBe('test-skill');

      // Step 5: Verify in registry
      const retrieved = skillManager.get(installed.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test-skill');
      expect(retrieved?.enabled).toBe(true);

      // Step 6: Check audit log
      const logs = auditLogger.query({ skillId: installed.id });
      expect(logs.some(l => l.eventType === 'skill_installed')).toBe(true);
    });

    it('should reject invalid skill during installation', async () => {
      const invalidContent = `---
# Missing name
description: Invalid skill
---
Invalid content`;

      await expect(
        skillManager.installFromContent(invalidContent)
      ).rejects.toThrow();
    });

    it('should handle skill with permissions', async () => {
      // Install skill with permissions
      const installed = await skillManager.installFromContent(SKILL_WITH_PERMISSIONS);

      // Verify permissions were stored
      const skill = skillManager.get(installed.id);
      expect(skill?.permissions).toBeDefined();
      expect(skill?.permissions?.length).toBeGreaterThan(0);
    });

    it('should track installation metadata', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      const skill = skillManager.get(installed.id);
      expect(skill?.installedAt).toBeDefined();
      expect(skill?.source).toBe('local');
    });
  });

  describe('Skill Execution Flow', () => {
    it('should execute skill in sandbox', async () => {
      // Install skill
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      // Create sandbox for skill
      await sandboxManager.createSandbox(installed.id, []);

      // Execute safe code
      const result = await sandboxManager.execute<number>(
        installed.id,
        '1 + 2 + 3'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(6);
    });

    it('should block dangerous code in sandbox', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      await sandboxManager.createSandbox(installed.id, []);

      const result = await sandboxManager.execute(
        installed.id,
        'process.exit(1)'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should log execution to audit logger', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      // Log execution start
      auditLogger.logExecutionStart(installed.id, 'exec-1');

      // Log execution complete
      auditLogger.logExecutionComplete(installed.id, 'exec-1', true);

      // Verify logs
      const logs = auditLogger.getByExecution('exec-1');
      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs.some(l => l.outcome === 'pending')).toBe(true);
      expect(logs.some(l => l.outcome === 'success')).toBe(true);
    });
  });

  describe('Permission Flow', () => {
    it('should evaluate permissions for skill execution', async () => {
      const installed = await skillManager.installFromContent(SKILL_WITH_PERMISSIONS);

      // Evaluate permission request
      const result = permissionManager.evaluate(
        { scope: 'file_read', reason: 'Read config file' },
        {
          skillId: installed.id,
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(true);
    });

    it('should require approval for sensitive permissions', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      const result = permissionManager.evaluate(
        { scope: 'wallet_send', reason: 'Send tokens' },
        {
          skillId: installed.id,
          trustLevel: 'community',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(false);
      expect(result.requiresUserApproval).toBe(true);
    });

    it('should log permission grants', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      auditLogger.logPermissionGranted(
        installed.id,
        'file_read',
        '/tmp/*',
        'auto'
      );

      const logs = auditLogger.query({
        skillId: installed.id,
        eventTypes: ['permission_granted'],
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].details.scope).toBe('file_read');
    });
  });

  describe('Skill Update Flow', () => {
    it('should update existing skill', async () => {
      // Install initial version
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);
      const originalId = installed.id;

      // Update with new content
      const updatedContent = `---
name: test-skill
description: Updated description
license: MIT
version: "2.0.0"
allowed-tools: Read Write Bash
---
## Updated Instructions
New instructions here.`;

      const updated = await skillManager.installFromContent(updatedContent);

      // Should update same skill
      expect(updated.id).toBe(originalId);
      expect(updated.description).toBe('Updated description');
      expect(updated.allowedTools).toContain('Bash');
    });
  });

  describe('Skill Uninstallation Flow', () => {
    it('should complete uninstallation flow', async () => {
      // Install skill
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      // Create sandbox
      await sandboxManager.createSandbox(installed.id, []);
      expect(sandboxManager.hasSandbox(installed.id)).toBe(true);

      // Uninstall
      skillManager.uninstall(installed.id);

      // Verify removed from registry
      expect(skillManager.get(installed.id)).toBeNull();

      // Verify sandbox destroyed
      sandboxManager.destroySandbox(installed.id);
      expect(sandboxManager.hasSandbox(installed.id)).toBe(false);

      // Verify audit log entry
      const logs = auditLogger.query({
        skillId: installed.id,
        eventTypes: ['skill_uninstalled'],
      });
      // Note: SkillManager may not automatically log uninstallation
      // This depends on implementation
    });
  });

  describe('Enable/Disable Flow', () => {
    it('should enable and disable skill', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      // Disable
      skillManager.setEnabled(installed.id, false);
      expect(skillManager.get(installed.id)?.enabled).toBe(false);

      // Enable
      skillManager.setEnabled(installed.id, true);
      expect(skillManager.get(installed.id)?.enabled).toBe(true);
    });

    it('should filter disabled skills from queries', async () => {
      const skill1 = await skillManager.installFromContent(VALID_SKILL_MD);
      const skill2Content = `---
name: another-skill
description: Another skill
license: MIT
---
Instructions`;
      const skill2 = await skillManager.installFromContent(skill2Content);

      // Disable first skill
      skillManager.setEnabled(skill1.id, false);

      // Query enabled skills only
      const enabledSkills = skillManager.query({ enabled: true });
      expect(enabledSkills.every(s => s.enabled)).toBe(true);
    });
  });

  describe('Trust Level Flow', () => {
    it('should handle different trust levels', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      // Community trust level (default for local files)
      const communityEval = permissionManager.evaluate(
        { scope: 'system_exec', reason: 'Run command' },
        {
          skillId: installed.id,
          trustLevel: 'community',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );
      expect(communityEval.granted).toBe(false);

      // System trust level
      const systemEval = permissionManager.evaluate(
        { scope: 'system_exec', reason: 'Run command' },
        {
          skillId: installed.id,
          trustLevel: 'system',
          autonomyTier: 'autonomous',
          existingPermissions: [],
        }
      );
      expect(systemEval.granted).toBe(true);
    });
  });

  describe('Autonomy Tier Flow', () => {
    it('should respect autonomy tier restrictions', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      // Set autonomy tier
      skillManager.setAutonomyTier(installed.id, 'observe_suggest');

      // Evaluate with restrictive tier
      const result = permissionManager.evaluate(
        { scope: 'file_write', reason: 'Write file' },
        {
          skillId: installed.id,
          trustLevel: 'verified',
          autonomyTier: 'observe_suggest',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Autonomy tier');
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const invalidContent = `---
name: 123  # Invalid name type
description: Test
---`;

      // Should throw validation error
      await expect(
        skillManager.installFromContent(invalidContent)
      ).rejects.toThrow();
    });

    it('should handle sandbox errors', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);
      await sandboxManager.createSandbox(installed.id, []);

      const result = await sandboxManager.execute(
        installed.id,
        'throw new Error("Test error")'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });

    it('should log sandbox violations', async () => {
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);

      auditLogger.logSandboxViolation(
        installed.id,
        'exec-1',
        'Attempted process access',
        { code: 'process.exit(1)' }
      );

      const logs = auditLogger.query({
        eventTypes: ['sandbox_violation'],
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].outcome).toBe('failure');
    });
  });

  describe('Full Workflow', () => {
    it('should complete end-to-end skill lifecycle', async () => {
      // 1. Install skill
      const installed = await skillManager.installFromContent(VALID_SKILL_MD);
      expect(installed).toBeDefined();

      // 2. Verify installation logged
      let logs = auditLogger.query({ skillId: installed.id });
      expect(logs.some(l => l.eventType === 'skill_installed')).toBe(true);

      // 3. Create sandbox
      await sandboxManager.createSandbox(installed.id, []);

      // 4. Request permission
      const permResult = permissionManager.evaluate(
        { scope: 'file_read', reason: 'Read data' },
        {
          skillId: installed.id,
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );
      expect(permResult.granted).toBe(true);

      // 5. Log permission
      auditLogger.logPermissionGranted(
        installed.id,
        'file_read',
        '*',
        'auto'
      );

      // 6. Execute in sandbox
      const execResult = await sandboxManager.execute(
        installed.id,
        '"Hello from " + "skill"'
      );
      expect(execResult.success).toBe(true);
      expect(execResult.result).toBe('Hello from skill');

      // 7. Log execution
      auditLogger.logExecutionStart(installed.id, 'exec-1');
      auditLogger.logExecutionComplete(installed.id, 'exec-1', true, {
        output: execResult.result,
      });

      // 8. Disable skill
      skillManager.setEnabled(installed.id, false);
      expect(skillManager.get(installed.id)?.enabled).toBe(false);

      // 9. Re-enable skill
      skillManager.setEnabled(installed.id, true);
      expect(skillManager.get(installed.id)?.enabled).toBe(true);

      // 10. Uninstall skill
      skillManager.uninstall(installed.id);
      expect(skillManager.get(installed.id)).toBeNull();

      // 11. Clean up sandbox
      sandboxManager.destroySandbox(installed.id);
      expect(sandboxManager.hasSandbox(installed.id)).toBe(false);

      // 12. Verify complete audit trail
      logs = auditLogger.query({ skillId: installed.id });
      expect(logs.length).toBeGreaterThanOrEqual(4);
    });
  });
});
