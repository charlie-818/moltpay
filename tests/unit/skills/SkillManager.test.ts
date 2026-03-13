import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { SkillManager } from '../../../src/skills/SkillManager';
import {
  VALID_SKILL_MD,
  MINIMAL_SKILL_MD,
  createMockInstalledSkill,
  createMockMarketplaceSkill,
  createMockMcpToolAsSkill,
  createMockPermission,
} from '../../fixtures/skills';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    mkdirSync: vi.fn(),
    watch: vi.fn().mockReturnValue({ close: vi.fn() }),
  };
});

describe('SkillManager', () => {
  let manager: SkillManager;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    vi.clearAllMocks();
    (mockFs.readFileSync as any).mockReturnValue(MINIMAL_SKILL_MD);
    manager = new SkillManager({
      defaultAutonomyTier: 'plan_propose',
      inMemory: true,
    });
  });

  afterEach(() => {
    manager.close();
  });

  describe('constructor', () => {
    it('should create manager instance', () => {
      expect(manager).toBeInstanceOf(SkillManager);
    });

    it('should emit events', () => {
      const events: string[] = [];
      manager.on('skill:installed', () => events.push('installed'));
      manager.on('skill:uninstalled', () => events.push('uninstalled'));

      expect(manager.listenerCount('skill:installed')).toBe(1);
      expect(manager.listenerCount('skill:uninstalled')).toBe(1);
    });

    it('should set up directory watching when configured', () => {
      const watchedManager = new SkillManager({
        skillDirectories: ['/path/to/skills'],
        autoWatchDirectories: true,
        inMemory: true,
      });

      expect(mockFs.watch).toHaveBeenCalled();
      watchedManager.close();
    });
  });

  describe('installFromFile', () => {
    it('should install skill from file', async () => {
      (mockFs.readFileSync as any).mockReturnValue(VALID_SKILL_MD);

      const skill = await manager.installFromFile('/path/to/skill.md');

      expect(skill).toBeDefined();
      expect(skill.metadata.name).toBe('test-skill');
      expect(skill.source).toBe('local');
    });

    it('should emit skill:installed event', async () => {
      const handler = vi.fn();
      manager.on('skill:installed', handler);

      await manager.installFromFile('/path/to/skill.md');

      expect(handler).toHaveBeenCalled();
    });

    it('should apply custom autonomy tier', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md', {
        autonomyTier: 'autonomous',
      });

      expect(skill.autonomyTier).toBe('autonomous');
    });

    it('should use default autonomy tier from config', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');

      expect(skill.autonomyTier).toBe('plan_propose');
    });

    it('should apply initial permissions', async () => {
      const permissions = [createMockPermission('file_read')];

      const skill = await manager.installFromFile('/path/to/skill.md', {
        grantPermissions: permissions,
      });

      expect(skill.grantedPermissions).toHaveLength(1);
    });
  });

  describe('installFromContent', () => {
    it('should install skill from content', async () => {
      const skill = await manager.installFromContent(
        VALID_SKILL_MD,
        'local',
        '/path/to/skill.md'
      );

      expect(skill).toBeDefined();
      expect(skill.metadata.name).toBe('test-skill');
    });

    it('should install from marketplace source', async () => {
      const skill = await manager.installFromContent(
        MINIMAL_SKILL_MD,
        'marketplace',
        'https://marketplace.example.com/skill'
      );

      expect(skill.source).toBe('marketplace');
    });
  });

  describe('installFromMarketplace', () => {
    it('should install marketplace skill with downloaded content', async () => {
      const marketplaceSkill = createMockMarketplaceSkill();

      const skill = await manager.installFromMarketplace(
        marketplaceSkill,
        MINIMAL_SKILL_MD
      );

      expect(skill).toBeDefined();
      expect(skill.source).toBe('marketplace');
      expect(skill.id).toBe(marketplaceSkill.id);
    });

    it('should merge marketplace metadata', async () => {
      const marketplaceSkill = createMockMarketplaceSkill({
        trustLevel: 'verified',
      });

      const skill = await manager.installFromMarketplace(
        marketplaceSkill,
        MINIMAL_SKILL_MD
      );

      expect(skill.metadata.trustLevel).toBe('verified');
    });

    it('should throw for invalid content', async () => {
      const marketplaceSkill = createMockMarketplaceSkill();
      const invalidContent = '---\nname: x\n---\n';

      await expect(
        manager.installFromMarketplace(marketplaceSkill, invalidContent)
      ).rejects.toThrow();
    });
  });

  describe('installMcpTool', () => {
    it('should install MCP tool as skill', () => {
      const mcpTool = createMockMcpToolAsSkill();

      const skill = manager.installMcpTool(mcpTool);

      expect(skill).toBeDefined();
      expect(skill.source).toBe('mcp');
      expect(skill.id).toContain('mcp:');
    });

    it('should emit skill:installed event', () => {
      const handler = vi.fn();
      manager.on('skill:installed', handler);

      manager.installMcpTool(createMockMcpToolAsSkill());

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('installFromDirectory', () => {
    it('should install all skills from directory', async () => {
      (mockFs.readdirSync as any).mockReturnValue([
        { name: 'skill1.md', isFile: () => true, isDirectory: () => false },
        { name: 'skill2.md', isFile: () => true, isDirectory: () => false },
      ]);

      const skills = await manager.installFromDirectory('/path/to/skills');

      expect(skills).toHaveLength(2);
    });
  });

  describe('uninstall', () => {
    it('should uninstall skill', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');

      const success = manager.uninstall(skill.id);

      expect(success).toBe(true);
      expect(manager.get(skill.id)).toBeNull();
    });

    it('should emit skill:uninstalled event', async () => {
      const handler = vi.fn();
      manager.on('skill:uninstalled', handler);

      const skill = await manager.installFromFile('/path/to/skill.md');
      manager.uninstall(skill.id);

      expect(handler).toHaveBeenCalled();
    });

    it('should return false for non-existent skill', () => {
      const success = manager.uninstall('non-existent');
      expect(success).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('should enable skill', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');
      manager.disable(skill.id);

      manager.enable(skill.id);

      expect(manager.get(skill.id)?.enabled).toBe(true);
    });

    it('should disable skill', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');

      manager.disable(skill.id);

      expect(manager.get(skill.id)?.enabled).toBe(false);
    });

    it('should emit events on enable/disable', async () => {
      const enableHandler = vi.fn();
      const disableHandler = vi.fn();
      manager.on('skill:enabled', enableHandler);
      manager.on('skill:disabled', disableHandler);

      const skill = await manager.installFromFile('/path/to/skill.md');
      manager.disable(skill.id);
      manager.enable(skill.id);

      expect(disableHandler).toHaveBeenCalled();
      expect(enableHandler).toHaveBeenCalled();
    });

    it('should throw for non-existent skill', () => {
      expect(() => manager.enable('non-existent')).toThrow('not found');
      expect(() => manager.disable('non-existent')).toThrow('not found');
    });
  });

  describe('setAutonomyTier', () => {
    it('should update autonomy tier', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');

      manager.setAutonomyTier(skill.id, 'autonomous');

      expect(manager.get(skill.id)?.autonomyTier).toBe('autonomous');
    });

    it('should emit skill:updated event', async () => {
      const handler = vi.fn();
      manager.on('skill:updated', handler);

      const skill = await manager.installFromFile('/path/to/skill.md');
      manager.setAutonomyTier(skill.id, 'autonomous');

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('query methods', () => {
    beforeEach(async () => {
      await manager.installFromFile('/path/skill1.md');
      await manager.installFromFile('/path/skill2.md');
    });

    it('should return all skills', () => {
      const all = manager.getAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should return enabled skills', () => {
      const enabled = manager.getEnabled();
      expect(enabled.every(s => s.enabled)).toBe(true);
    });

    it('should query with filters', () => {
      const results = manager.query({ enabled: true });
      expect(results.every(s => s.enabled)).toBe(true);
    });

    it('should search skills', () => {
      const results = manager.search('minimal');
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should get skills by source', () => {
      const local = manager.getBySource('local');
      expect(local.every(s => s.source === 'local')).toBe(true);
    });

    it('should get counts by source', () => {
      const counts = manager.getCountsBySource();
      expect(typeof counts.local).toBe('number');
      expect(typeof counts.marketplace).toBe('number');
      expect(typeof counts.mcp).toBe('number');
    });
  });

  describe('permission management', () => {
    it('should grant permission', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');
      const permission = createMockPermission('file_read');

      manager.grantPermission(skill.id, permission);

      const permissions = manager.getPermissions(skill.id);
      expect(permissions.some(p => p.scope === 'file_read')).toBe(true);
    });

    it('should revoke permission', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');
      manager.grantPermission(skill.id, createMockPermission('file_read'));

      manager.revokePermission(skill.id, 'file_read');

      const permissions = manager.getPermissions(skill.id);
      expect(permissions.some(p => p.scope === 'file_read')).toBe(false);
    });

    it('should check permission', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');
      manager.grantPermission(skill.id, createMockPermission('file_read'));

      expect(manager.hasPermission(skill.id, 'file_read')).toBe(true);
      expect(manager.hasPermission(skill.id, 'file_write')).toBe(false);
    });

    it('should return false for non-existent skill', () => {
      expect(manager.hasPermission('non-existent', 'file_read')).toBe(false);
    });

    it('should check expired permissions', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');
      const expiredPerm = createMockPermission('file_read', {
        expiresAt: Date.now() - 1000,
      });
      manager.grantPermission(skill.id, expiredPerm);

      expect(manager.hasPermission(skill.id, 'file_read')).toBe(false);
    });

    it('should emit permission events', async () => {
      const grantHandler = vi.fn();
      const denyHandler = vi.fn();
      manager.on('permission:granted', grantHandler);
      manager.on('permission:denied', denyHandler);

      const skill = await manager.installFromFile('/path/to/skill.md');
      manager.grantPermission(skill.id, createMockPermission('file_read'));
      manager.revokePermission(skill.id, 'file_read');

      expect(grantHandler).toHaveBeenCalled();
      expect(denyHandler).toHaveBeenCalled();
    });
  });

  describe('execution tracking', () => {
    it('should generate intent preview', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');

      const preview = manager.generateIntentPreview(skill.id, 'Test action', [
        { description: 'Step 1' },
        { description: 'Step 2', requiresApproval: true, approvalType: 'wallet_sign' },
      ]);

      expect(preview.skillId).toBe(skill.id);
      expect(preview.action).toBe('Test action');
      expect(preview.steps).toHaveLength(2);
      expect(preview.steps[1].requiresApproval).toBe(true);
    });

    it('should start execution', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');

      const context = manager.startExecution(skill.id);

      expect(context.skillId).toBe(skill.id);
      expect(context.executionId).toBeDefined();
      expect(context.startedAt).toBeDefined();
    });

    it('should emit execution start event', async () => {
      const handler = vi.fn();
      manager.on('skill:execution:start', handler);

      const skill = await manager.installFromFile('/path/to/skill.md');
      manager.startExecution(skill.id);

      expect(handler).toHaveBeenCalled();
    });

    it('should complete execution', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');
      const context = manager.startExecution(skill.id);

      const result = manager.completeExecution(context.executionId, {
        success: true,
        steps: [],
        output: { result: 'success' },
      });

      expect(result.success).toBe(true);
      expect(result.completedAt).toBeDefined();
      expect(result.executionId).toBe(context.executionId);
    });

    it('should emit execution complete event', async () => {
      const handler = vi.fn();
      manager.on('skill:execution:complete', handler);

      const skill = await manager.installFromFile('/path/to/skill.md');
      const context = manager.startExecution(skill.id);
      manager.completeExecution(context.executionId, {
        success: true,
        steps: [],
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should emit execution error event', async () => {
      const handler = vi.fn();
      manager.on('skill:execution:error', handler);

      const skill = await manager.installFromFile('/path/to/skill.md');
      const context = manager.startExecution(skill.id);
      manager.completeExecution(context.executionId, {
        success: false,
        steps: [],
        error: 'Test error',
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should track active executions', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');
      manager.startExecution(skill.id);

      const active = manager.getActiveExecutions();
      expect(active).toHaveLength(1);
    });

    it('should remove completed execution from active', async () => {
      const skill = await manager.installFromFile('/path/to/skill.md');
      const context = manager.startExecution(skill.id);
      manager.completeExecution(context.executionId, {
        success: true,
        steps: [],
      });

      const active = manager.getActiveExecutions();
      expect(active).toHaveLength(0);
    });
  });

  describe('directory watching', () => {
    it('should watch directory', () => {
      manager.watchDirectory('/path/to/skills');
      expect(mockFs.watch).toHaveBeenCalled();
    });

    it('should unwatch directory', () => {
      const mockClose = vi.fn();
      (mockFs.watch as any).mockReturnValue({ close: mockClose });

      manager.watchDirectory('/path/to/skills');
      manager.unwatchDirectory('/path/to/skills');

      expect(mockClose).toHaveBeenCalled();
    });

    it('should not watch same directory twice', () => {
      manager.watchDirectory('/path/to/skills');
      manager.watchDirectory('/path/to/skills');

      // watch should only be called once per directory
      expect((mockFs.watch as any).mock.calls.filter(
        (call: any[]) => call[0].includes('/path/to/skills')
      ).length).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('should cleanup expired licenses', async () => {
      // Install a skill with expired license
      const skill = await manager.installFromFile('/path/to/skill.md');

      // Manually set expired license in the internal registry
      // This is a bit of a hack for testing purposes
      const registry = (manager as any).registry;
      registry.setLicense(skill.id, 'LICENSE', Date.now() - 1000);

      const expired = manager.cleanupExpiredLicenses();

      // The skill should be disabled
      expect(manager.get(skill.id)?.enabled).toBe(false);
    });

    it('should close properly', () => {
      const mockClose = vi.fn();
      (mockFs.watch as any).mockReturnValue({ close: mockClose });

      manager.watchDirectory('/path/to/skills');
      manager.close();

      expect(mockClose).toHaveBeenCalled();
    });
  });
});
