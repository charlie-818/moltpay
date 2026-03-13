import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionManager } from '../../../src/security/PermissionManager';
import { createMockPermission } from '../../fixtures/skills';

describe('PermissionManager', () => {
  let permissionManager: PermissionManager;

  beforeEach(() => {
    permissionManager = new PermissionManager();
  });

  describe('constructor', () => {
    it('should create with default policies', () => {
      expect(permissionManager.getPolicy('file_read')).toBeDefined();
      expect(permissionManager.getPolicy('wallet_send')).toBeDefined();
    });

    it('should accept custom policies', () => {
      const customManager = new PermissionManager([
        {
          scope: 'file_read',
          requiresUserApproval: true,
          autoGrantForTrustLevels: [],
        },
      ]);

      const policy = customManager.getPolicy('file_read');
      expect(policy?.requiresUserApproval).toBe(true);
      expect(policy?.autoGrantForTrustLevels).toEqual([]);
    });
  });

  describe('evaluate', () => {
    it('should auto-grant file_read for verified trust level', () => {
      const result = permissionManager.evaluate(
        { scope: 'file_read', reason: 'Read config' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'plan_propose',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(true);
      expect(result.requiresUserApproval).toBe(false);
    });

    it('should auto-grant for system trust level', () => {
      const result = permissionManager.evaluate(
        { scope: 'system_exec', reason: 'Execute command' },
        {
          skillId: 'test-skill',
          trustLevel: 'system',
          autonomyTier: 'autonomous',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(true);
    });

    it('should require approval for wallet_send', () => {
      const result = permissionManager.evaluate(
        { scope: 'wallet_send', reason: 'Send tokens' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(false);
      expect(result.requiresUserApproval).toBe(true);
    });

    it('should return existing permission if already granted', () => {
      const existingPerm = createMockPermission('file_read');

      const result = permissionManager.evaluate(
        { scope: 'file_read', reason: 'Read file' },
        {
          skillId: 'test-skill',
          trustLevel: 'untrusted',
          autonomyTier: 'observe_suggest',
          existingPermissions: [existingPerm],
        }
      );

      expect(result.granted).toBe(true);
      expect(result.reason).toContain('already granted');
    });

    it('should not return expired permission', () => {
      const expiredPerm = createMockPermission('file_read', {
        expiresAt: Date.now() - 1000,
      });

      const result = permissionManager.evaluate(
        { scope: 'file_read', reason: 'Read file' },
        {
          skillId: 'test-skill',
          trustLevel: 'untrusted',
          autonomyTier: 'observe_suggest',
          existingPermissions: [expiredPerm],
        }
      );

      expect(result.granted).toBe(false);
    });

    it('should check autonomy tier', () => {
      const result = permissionManager.evaluate(
        { scope: 'file_write', reason: 'Write file' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'observe_suggest', // Too restrictive
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Autonomy tier');
    });

    it('should validate resource patterns', () => {
      const result = permissionManager.evaluate(
        { scope: 'file_read', resource: '/restricted/path', reason: 'Read file' },
        {
          skillId: 'test-skill',
          trustLevel: 'community',
          autonomyTier: 'plan_propose',
          existingPermissions: [],
        }
      );

      // Should auto-grant since file_read allows community with '*' pattern
      expect(result.granted).toBe(true);
    });

    it('should return unknown scope error', () => {
      const result = permissionManager.evaluate(
        { scope: 'unknown_scope' as any, reason: 'Unknown' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'autonomous',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Unknown permission scope');
    });

    it('should set permission expiry based on policy', () => {
      const result = permissionManager.evaluate(
        { scope: 'wallet_sign', reason: 'Sign transaction' },
        {
          skillId: 'test-skill',
          trustLevel: 'system',
          autonomyTier: 'autonomous',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(true);
      expect(result.permission?.expiresAt).toBeDefined();
    });
  });

  describe('requestWithApproval', () => {
    it('should return immediately for auto-granted permissions', async () => {
      const result = await permissionManager.requestWithApproval(
        { scope: 'file_read', reason: 'Read file' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(true);
    });

    it('should emit approval_needed event', async () => {
      const handler = vi.fn();
      permissionManager.on('permission:approval_needed', handler);

      // Don't await - this will timeout
      const promise = permissionManager.requestWithApproval(
        { scope: 'wallet_send', reason: 'Send tokens' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      // Wait a bit for event to emit
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(handler).toHaveBeenCalled();

      // Get the requestId and cancel to avoid timeout
      const requestId = handler.mock.calls[0][0].requestId;
      permissionManager.cancelRequest(requestId);
    });
  });

  describe('respondToRequest', () => {
    it('should approve pending request', async () => {
      let capturedRequestId: string;
      permissionManager.on('permission:approval_needed', (data) => {
        capturedRequestId = data.requestId;
      });

      const promise = permissionManager.requestWithApproval(
        { scope: 'wallet_send', reason: 'Send tokens' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      permissionManager.respondToRequest(capturedRequestId!, true);

      const result = await promise;
      expect(result.granted).toBe(true);
      expect(result.permission?.grantedBy).toBe('user');
    });

    it('should deny pending request', async () => {
      let capturedRequestId: string;
      permissionManager.on('permission:approval_needed', (data) => {
        capturedRequestId = data.requestId;
      });

      const promise = permissionManager.requestWithApproval(
        { scope: 'wallet_send', reason: 'Send tokens' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      permissionManager.respondToRequest(capturedRequestId!, false);

      const result = await promise;
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Denied');
    });

    it('should throw for unknown request ID', () => {
      expect(() =>
        permissionManager.respondToRequest('unknown-id', true)
      ).toThrow('No pending request');
    });

    it('should emit approved event', async () => {
      const approvedHandler = vi.fn();
      permissionManager.on('permission:approved', approvedHandler);

      let capturedRequestId: string;
      permissionManager.on('permission:approval_needed', (data) => {
        capturedRequestId = data.requestId;
      });

      const promise = permissionManager.requestWithApproval(
        { scope: 'wallet_send', reason: 'Send tokens' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      await new Promise(resolve => setTimeout(resolve, 50));
      permissionManager.respondToRequest(capturedRequestId!, true);

      await promise;
      expect(approvedHandler).toHaveBeenCalled();
    });

    it('should emit denied event', async () => {
      const deniedHandler = vi.fn();
      permissionManager.on('permission:denied', deniedHandler);

      let capturedRequestId: string;
      permissionManager.on('permission:approval_needed', (data) => {
        capturedRequestId = data.requestId;
      });

      const promise = permissionManager.requestWithApproval(
        { scope: 'wallet_send', reason: 'Send tokens' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      await new Promise(resolve => setTimeout(resolve, 50));
      permissionManager.respondToRequest(capturedRequestId!, false);

      await promise;
      expect(deniedHandler).toHaveBeenCalled();
    });
  });

  describe('isValid', () => {
    it('should return true for non-expired permission', () => {
      const perm = createMockPermission('file_read', {
        expiresAt: Date.now() + 10000,
      });

      expect(permissionManager.isValid(perm)).toBe(true);
    });

    it('should return false for expired permission', () => {
      const perm = createMockPermission('file_read', {
        expiresAt: Date.now() - 1000,
      });

      expect(permissionManager.isValid(perm)).toBe(false);
    });

    it('should return true for permission without expiry', () => {
      const perm = createMockPermission('file_read');

      expect(permissionManager.isValid(perm)).toBe(true);
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired permissions', () => {
      const permissions = [
        createMockPermission('file_read', { expiresAt: Date.now() - 1000 }),
        createMockPermission('file_write', { expiresAt: Date.now() + 10000 }),
        createMockPermission('network_fetch'),
      ];

      const cleaned = permissionManager.cleanupExpired(permissions);

      expect(cleaned).toHaveLength(2);
      expect(cleaned.every(p => permissionManager.isValid(p))).toBe(true);
    });
  });

  describe('getPendingRequests', () => {
    it('should return all pending requests', async () => {
      permissionManager.on('permission:approval_needed', () => {});

      permissionManager.requestWithApproval(
        { scope: 'wallet_send', reason: 'Test 1' },
        {
          skillId: 'skill-1',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      permissionManager.requestWithApproval(
        { scope: 'system_exec', reason: 'Test 2' },
        {
          skillId: 'skill-2',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      const pending = permissionManager.getPendingRequests();
      expect(pending).toHaveLength(2);

      // Cancel all to cleanup
      for (const req of pending) {
        permissionManager.cancelRequest(req.requestId);
      }
    });
  });

  describe('cancelRequest', () => {
    it('should cancel pending request', async () => {
      let capturedRequestId: string;
      permissionManager.on('permission:approval_needed', (data) => {
        capturedRequestId = data.requestId;
      });

      const promise = permissionManager.requestWithApproval(
        { scope: 'wallet_send', reason: 'Send tokens' },
        {
          skillId: 'test-skill',
          trustLevel: 'verified',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      await new Promise(resolve => setTimeout(resolve, 50));
      permissionManager.cancelRequest(capturedRequestId!);

      const result = await promise;
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('cancelled');
    });

    it('should do nothing for unknown request', () => {
      expect(() =>
        permissionManager.cancelRequest('unknown')
      ).not.toThrow();
    });
  });

  describe('setPolicy', () => {
    it('should add or update policy', () => {
      permissionManager.setPolicy({
        scope: 'file_read',
        requiresUserApproval: true,
        autoGrantForTrustLevels: [],
      });

      const policy = permissionManager.getPolicy('file_read');
      expect(policy?.requiresUserApproval).toBe(true);
      expect(policy?.autoGrantForTrustLevels).toEqual([]);
    });
  });

  describe('getRequiredPermissions', () => {
    it('should return permissions for Read tool', () => {
      const perms = permissionManager.getRequiredPermissions(['Read']);
      expect(perms).toContain('file_read');
    });

    it('should return permissions for Write tool', () => {
      const perms = permissionManager.getRequiredPermissions(['Write']);
      expect(perms).toContain('file_write');
    });

    it('should return permissions for WebFetch tool', () => {
      const perms = permissionManager.getRequiredPermissions(['WebFetch']);
      expect(perms).toContain('network_fetch');
    });

    it('should return permissions for Bash tool', () => {
      const perms = permissionManager.getRequiredPermissions(['Bash']);
      expect(perms).toContain('system_exec');
    });

    it('should return permissions for MCP tools', () => {
      const perms = permissionManager.getRequiredPermissions(['mcp_read_file']);
      expect(perms).toContain('network_connect');
    });

    it('should combine multiple tools', () => {
      const perms = permissionManager.getRequiredPermissions(['Read', 'Write', 'WebFetch']);
      expect(perms).toContain('file_read');
      expect(perms).toContain('file_write');
      expect(perms).toContain('network_fetch');
    });

    it('should deduplicate permissions', () => {
      const perms = permissionManager.getRequiredPermissions(['Write', 'Edit']);
      expect(perms.filter(p => p === 'file_write')).toHaveLength(1);
    });
  });
});
