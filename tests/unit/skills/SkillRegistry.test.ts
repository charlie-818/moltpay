import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkillRegistry } from '../../../src/skills/SkillRegistry';
import { createMockInstalledSkill, createMockPermission } from '../../fixtures/skills';

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    // Use in-memory database for tests
    registry = new SkillRegistry({ inMemory: true });
  });

  afterEach(() => {
    registry.close();
  });

  describe('register', () => {
    it('should register a new skill', () => {
      const skill = createMockInstalledSkill({ id: 'test-skill-1' });

      registry.register(skill);
      const retrieved = registry.get('test-skill-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-skill-1');
    });

    it('should update existing skill on re-register', () => {
      const skill1 = createMockInstalledSkill({ id: 'test-skill', name: 'Original' });
      const skill2 = createMockInstalledSkill({ id: 'test-skill', name: 'Updated' });

      registry.register(skill1);
      registry.register(skill2);

      const retrieved = registry.get('test-skill');
      expect(retrieved?.metadata.name).toBe('Updated');
    });

    it('should store all metadata fields', () => {
      const skill = createMockInstalledSkill({
        id: 'metadata-test',
        name: 'Metadata Test',
        description: 'Testing metadata storage',
        trustLevel: 'verified',
      });

      registry.register(skill);
      const retrieved = registry.get('metadata-test');

      expect(retrieved?.metadata.name).toBe('Metadata Test');
      expect(retrieved?.metadata.description).toBe('Testing metadata storage');
      expect(retrieved?.metadata.trustLevel).toBe('verified');
    });

    it('should store permissions', () => {
      const skill = createMockInstalledSkill({ id: 'perm-test' });
      skill.grantedPermissions = [
        createMockPermission('file_read', { resource: '/tmp/*' }),
        createMockPermission('network_fetch'),
      ];

      registry.register(skill);
      const permissions = registry.getPermissions('perm-test');

      expect(permissions).toHaveLength(2);
      expect(permissions.some(p => p.scope === 'file_read')).toBe(true);
      expect(permissions.some(p => p.scope === 'network_fetch')).toBe(true);
    });
  });

  describe('get', () => {
    it('should return skill by ID', () => {
      const skill = createMockInstalledSkill({ id: 'find-me' });
      registry.register(skill);

      const found = registry.get('find-me');
      expect(found).toBeDefined();
      expect(found?.id).toBe('find-me');
    });

    it('should return null for non-existent skill', () => {
      const result = registry.get('does-not-exist');
      expect(result).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return all registered skills', () => {
      registry.register(createMockInstalledSkill({ id: 'skill-1' }));
      registry.register(createMockInstalledSkill({ id: 'skill-2' }));
      registry.register(createMockInstalledSkill({ id: 'skill-3' }));

      const all = registry.getAll();
      expect(all).toHaveLength(3);
    });

    it('should return empty array when no skills', () => {
      const all = registry.getAll();
      expect(all).toEqual([]);
    });

    it('should return skills ordered by installedAt descending', () => {
      const skill1 = createMockInstalledSkill({ id: 'older' });
      skill1.installedAt = Date.now() - 10000;

      const skill2 = createMockInstalledSkill({ id: 'newer' });
      skill2.installedAt = Date.now();

      registry.register(skill1);
      registry.register(skill2);

      const all = registry.getAll();
      expect(all[0].id).toBe('newer');
      expect(all[1].id).toBe('older');
    });
  });

  describe('unregister', () => {
    it('should remove skill', () => {
      const skill = createMockInstalledSkill({ id: 'to-remove' });
      registry.register(skill);

      const success = registry.unregister('to-remove');
      expect(success).toBe(true);
      expect(registry.get('to-remove')).toBeNull();
    });

    it('should return false for non-existent skill', () => {
      const success = registry.unregister('not-found');
      expect(success).toBe(false);
    });

    it('should cascade delete permissions', () => {
      const skill = createMockInstalledSkill({ id: 'cascade-test' });
      skill.grantedPermissions = [createMockPermission('file_read')];
      registry.register(skill);

      registry.unregister('cascade-test');

      // Permissions should be deleted
      const permissions = registry.getPermissions('cascade-test');
      expect(permissions).toHaveLength(0);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      registry.register(createMockInstalledSkill({
        id: 'enabled-local',
        source: 'local',
        enabled: true,
        trustLevel: 'verified',
      }));
      registry.register(createMockInstalledSkill({
        id: 'disabled-local',
        source: 'local',
        enabled: false,
        trustLevel: 'community',
      }));
      registry.register(createMockInstalledSkill({
        id: 'enabled-mcp',
        source: 'mcp',
        enabled: true,
        trustLevel: 'verified',
      }));
    });

    it('should filter by enabled status', () => {
      const enabled = registry.query({ enabled: true });
      expect(enabled).toHaveLength(2);
      expect(enabled.every(s => s.enabled)).toBe(true);
    });

    it('should filter by source', () => {
      const local = registry.query({ source: 'local' });
      expect(local).toHaveLength(2);
      expect(local.every(s => s.source === 'local')).toBe(true);
    });

    it('should filter by trust level', () => {
      const verified = registry.query({ trustLevel: ['verified'] });
      expect(verified).toHaveLength(2);
    });

    it('should combine multiple filters', () => {
      const result = registry.query({
        enabled: true,
        source: 'local',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('enabled-local');
    });

    it('should support limit', () => {
      const result = registry.query({ limit: 1 });
      expect(result).toHaveLength(1);
    });

    it('should support offset', () => {
      const all = registry.query({});
      const offset = registry.query({ offset: 1 });

      expect(offset).toHaveLength(all.length - 1);
    });
  });

  describe('setEnabled', () => {
    it('should enable skill', () => {
      registry.register(createMockInstalledSkill({ id: 'toggle', enabled: false }));

      registry.setEnabled('toggle', true);
      const skill = registry.get('toggle');

      expect(skill?.enabled).toBe(true);
    });

    it('should disable skill', () => {
      registry.register(createMockInstalledSkill({ id: 'toggle', enabled: true }));

      registry.setEnabled('toggle', false);
      const skill = registry.get('toggle');

      expect(skill?.enabled).toBe(false);
    });
  });

  describe('setAutonomyTier', () => {
    it('should update autonomy tier', () => {
      registry.register(createMockInstalledSkill({
        id: 'autonomy-test',
        autonomyTier: 'observe_suggest',
      }));

      registry.setAutonomyTier('autonomy-test', 'autonomous');
      const skill = registry.get('autonomy-test');

      expect(skill?.autonomyTier).toBe('autonomous');
    });
  });

  describe('updateLastUsed', () => {
    it('should update lastUsedAt timestamp', () => {
      registry.register(createMockInstalledSkill({ id: 'usage-test' }));

      const before = Date.now();
      registry.updateLastUsed('usage-test');
      const after = Date.now();

      const skill = registry.get('usage-test');
      expect(skill?.lastUsedAt).toBeGreaterThanOrEqual(before);
      expect(skill?.lastUsedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('setPermissions', () => {
    it('should set permissions for skill', () => {
      registry.register(createMockInstalledSkill({ id: 'perm-set' }));

      const permissions = [
        createMockPermission('file_read'),
        createMockPermission('network_fetch'),
      ];

      registry.setPermissions('perm-set', permissions);
      const retrieved = registry.getPermissions('perm-set');

      expect(retrieved).toHaveLength(2);
    });

    it('should replace existing permissions', () => {
      registry.register(createMockInstalledSkill({ id: 'perm-replace' }));
      registry.setPermissions('perm-replace', [createMockPermission('file_read')]);

      registry.setPermissions('perm-replace', [createMockPermission('network_fetch')]);
      const retrieved = registry.getPermissions('perm-replace');

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].scope).toBe('network_fetch');
    });
  });

  describe('addPermission', () => {
    it('should add single permission', () => {
      registry.register(createMockInstalledSkill({ id: 'add-perm' }));

      registry.addPermission('add-perm', createMockPermission('file_read'));
      registry.addPermission('add-perm', createMockPermission('file_write'));

      const permissions = registry.getPermissions('add-perm');
      expect(permissions).toHaveLength(2);
    });
  });

  describe('revokePermission', () => {
    it('should revoke permission by scope', () => {
      registry.register(createMockInstalledSkill({ id: 'revoke-test' }));
      registry.setPermissions('revoke-test', [
        createMockPermission('file_read'),
        createMockPermission('file_write'),
      ]);

      registry.revokePermission('revoke-test', 'file_read');
      const permissions = registry.getPermissions('revoke-test');

      expect(permissions).toHaveLength(1);
      expect(permissions[0].scope).toBe('file_write');
    });

    it('should revoke permission by scope and resource', () => {
      registry.register(createMockInstalledSkill({ id: 'revoke-resource' }));
      registry.setPermissions('revoke-resource', [
        createMockPermission('file_read', { resource: '/tmp/*' }),
        createMockPermission('file_read', { resource: '/home/*' }),
      ]);

      registry.revokePermission('revoke-resource', 'file_read', '/tmp/*');
      const permissions = registry.getPermissions('revoke-resource');

      expect(permissions).toHaveLength(1);
      expect(permissions[0].resource).toBe('/home/*');
    });
  });

  describe('setLicense', () => {
    it('should set license key', () => {
      registry.register(createMockInstalledSkill({ id: 'license-test' }));

      registry.setLicense('license-test', 'LICENSE-KEY-123');
      const skill = registry.get('license-test');

      expect(skill?.licenseKey).toBe('LICENSE-KEY-123');
    });

    it('should set license expiry', () => {
      registry.register(createMockInstalledSkill({ id: 'expiry-test' }));
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

      registry.setLicense('expiry-test', 'LICENSE-KEY', expiresAt);
      const skill = registry.get('expiry-test');

      expect(skill?.licenseExpiresAt).toBe(expiresAt);
    });
  });

  describe('countBySource', () => {
    it('should return counts by source', () => {
      registry.register(createMockInstalledSkill({ id: 's1', source: 'local' }));
      registry.register(createMockInstalledSkill({ id: 's2', source: 'local' }));
      registry.register(createMockInstalledSkill({ id: 's3', source: 'mcp' }));
      registry.register(createMockInstalledSkill({ id: 's4', source: 'marketplace' }));

      const counts = registry.countBySource();

      expect(counts.local).toBe(2);
      expect(counts.mcp).toBe(1);
      expect(counts.marketplace).toBe(1);
    });

    it('should return zeros when empty', () => {
      const counts = registry.countBySource();

      expect(counts.local).toBe(0);
      expect(counts.mcp).toBe(0);
      expect(counts.marketplace).toBe(0);
    });
  });

  describe('getExpiredLicenses', () => {
    it('should return skills with expired licenses', () => {
      const expiredSkill = createMockInstalledSkill({ id: 'expired' });
      expiredSkill.licenseExpiresAt = Date.now() - 1000; // Already expired

      const validSkill = createMockInstalledSkill({ id: 'valid' });
      validSkill.licenseExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

      registry.register(expiredSkill);
      registry.register(validSkill);

      const expired = registry.getExpiredLicenses();

      expect(expired).toHaveLength(1);
      expect(expired[0].id).toBe('expired');
    });

    it('should not return skills without license expiry', () => {
      registry.register(createMockInstalledSkill({ id: 'no-expiry' }));

      const expired = registry.getExpiredLicenses();
      expect(expired).toHaveLength(0);
    });
  });

  describe('search (FTS)', () => {
    beforeEach(() => {
      registry.register(createMockInstalledSkill({
        id: 'solana-swap',
        name: 'Solana Token Swap',
        description: 'Swap tokens on Solana blockchain',
      }));
      registry.register(createMockInstalledSkill({
        id: 'file-manager',
        name: 'File Manager',
        description: 'Manage files and directories',
      }));
    });

    it('should search by name', () => {
      const results = registry.query({ search: 'Solana' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('solana-swap');
    });

    it('should search by description', () => {
      const results = registry.query({ search: 'blockchain' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty for no matches', () => {
      const results = registry.query({ search: 'nonexistent' });
      expect(results).toHaveLength(0);
    });
  });
});
