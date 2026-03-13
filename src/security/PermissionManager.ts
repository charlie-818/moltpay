import { EventEmitter } from 'events';
import {
  Permission,
  PermissionRequest,
  PermissionScope,
  AutonomyTier,
  TrustLevel,
  PermissionError,
} from '../skills/types';

export interface PermissionPolicy {
  scope: PermissionScope;
  requiresUserApproval: boolean;
  autoGrantForTrustLevels?: TrustLevel[];
  maxDuration?: number;  // Max permission duration in ms
  resourcePatterns?: string[];  // Allowed resource patterns
}

export interface PermissionDecision {
  granted: boolean;
  permission?: Permission;
  reason: string;
  requiresUserApproval: boolean;
}

export interface PermissionContext {
  skillId: string;
  trustLevel: TrustLevel;
  autonomyTier: AutonomyTier;
  existingPermissions: Permission[];
}

const DEFAULT_POLICIES: PermissionPolicy[] = [
  // File read - generally safe
  {
    scope: 'file_read',
    requiresUserApproval: false,
    autoGrantForTrustLevels: ['system', 'verified', 'community'],
    resourcePatterns: ['*'],
  },
  // File write - requires approval except for system
  {
    scope: 'file_write',
    requiresUserApproval: true,
    autoGrantForTrustLevels: ['system'],
    maxDuration: 3600000, // 1 hour
  },
  // Network fetch - safe for read-only
  {
    scope: 'network_fetch',
    requiresUserApproval: false,
    autoGrantForTrustLevels: ['system', 'verified', 'community'],
    resourcePatterns: ['*'],
  },
  // Network connect - requires approval
  {
    scope: 'network_connect',
    requiresUserApproval: true,
    autoGrantForTrustLevels: ['system', 'verified'],
    maxDuration: 3600000,
  },
  // Wallet read - safe
  {
    scope: 'wallet_read',
    requiresUserApproval: false,
    autoGrantForTrustLevels: ['system', 'verified', 'community'],
  },
  // Wallet sign - always requires approval
  {
    scope: 'wallet_sign',
    requiresUserApproval: true,
    autoGrantForTrustLevels: ['system'],
    maxDuration: 300000, // 5 minutes
  },
  // Wallet send - always requires approval
  {
    scope: 'wallet_send',
    requiresUserApproval: true,
    autoGrantForTrustLevels: [], // Never auto-grant
    maxDuration: 300000,
  },
  // System exec - highly restricted
  {
    scope: 'system_exec',
    requiresUserApproval: true,
    autoGrantForTrustLevels: ['system'],
    maxDuration: 60000, // 1 minute
  },
];

export class PermissionManager extends EventEmitter {
  private policies: Map<PermissionScope, PermissionPolicy>;
  private pendingRequests: Map<string, {
    request: PermissionRequest;
    context: PermissionContext;
    resolve: (decision: PermissionDecision) => void;
  }> = new Map();

  constructor(customPolicies?: PermissionPolicy[]) {
    super();

    this.policies = new Map();

    // Load default policies
    for (const policy of DEFAULT_POLICIES) {
      this.policies.set(policy.scope, policy);
    }

    // Override with custom policies
    if (customPolicies) {
      for (const policy of customPolicies) {
        this.policies.set(policy.scope, policy);
      }
    }
  }

  /**
   * Evaluate a permission request
   */
  evaluate(
    request: PermissionRequest,
    context: PermissionContext
  ): PermissionDecision {
    const policy = this.policies.get(request.scope);

    if (!policy) {
      return {
        granted: false,
        reason: `Unknown permission scope: ${request.scope}`,
        requiresUserApproval: true,
      };
    }

    // Check if already has permission
    const existing = this.findExistingPermission(request, context.existingPermissions);
    if (existing) {
      return {
        granted: true,
        permission: existing,
        reason: 'Permission already granted',
        requiresUserApproval: false,
      };
    }

    // Check autonomy tier
    const autonomyAllows = this.checkAutonomyTier(request.scope, context.autonomyTier);
    if (!autonomyAllows) {
      return {
        granted: false,
        reason: `Autonomy tier ${context.autonomyTier} does not allow ${request.scope}`,
        requiresUserApproval: true,
      };
    }

    // Check if auto-grant based on trust level
    if (policy.autoGrantForTrustLevels?.includes(context.trustLevel)) {
      // Validate resource pattern if applicable
      if (request.resource && policy.resourcePatterns) {
        const allowed = policy.resourcePatterns.some(pattern =>
          this.matchResourcePattern(pattern, request.resource!)
        );
        if (!allowed) {
          return {
            granted: false,
            reason: `Resource ${request.resource} not allowed by policy`,
            requiresUserApproval: true,
          };
        }
      }

      // Apply max duration if set
      const duration = policy.maxDuration
        ? Math.min(request.duration || policy.maxDuration, policy.maxDuration)
        : request.duration;

      const permission: Permission = {
        scope: request.scope,
        resource: request.resource,
        expiresAt: duration ? Date.now() + duration : undefined,
        grantedAt: Date.now(),
        grantedBy: 'system',
      };

      return {
        granted: true,
        permission,
        reason: 'Auto-granted based on trust level',
        requiresUserApproval: false,
      };
    }

    // Requires user approval
    return {
      granted: false,
      reason: policy.requiresUserApproval
        ? 'Policy requires user approval'
        : `Trust level ${context.trustLevel} requires approval for ${request.scope}`,
      requiresUserApproval: true,
    };
  }

  /**
   * Request permission with user approval flow
   */
  async requestWithApproval(
    request: PermissionRequest,
    context: PermissionContext
  ): Promise<PermissionDecision> {
    // First try automatic evaluation
    const autoDecision = this.evaluate(request, context);

    if (autoDecision.granted || !autoDecision.requiresUserApproval) {
      return autoDecision;
    }

    // Emit event for UI to handle
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, { request, context, resolve });

      this.emit('permission:approval_needed', {
        requestId,
        request,
        context,
        reason: autoDecision.reason,
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          resolve({
            granted: false,
            reason: 'Permission request timed out',
            requiresUserApproval: false,
          });
        }
      }, 300000);
    });
  }

  /**
   * Respond to a pending permission request (called from UI)
   */
  respondToRequest(
    requestId: string,
    approved: boolean,
    options?: {
      duration?: number;
      resource?: string;
    }
  ): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      throw new PermissionError(`No pending request with ID: ${requestId}`);
    }

    const { request, resolve } = pending;
    this.pendingRequests.delete(requestId);

    if (approved) {
      const permission: Permission = {
        scope: request.scope,
        resource: options?.resource || request.resource,
        expiresAt: options?.duration ? Date.now() + options.duration : undefined,
        grantedAt: Date.now(),
        grantedBy: 'user',
      };

      resolve({
        granted: true,
        permission,
        reason: 'Approved by user',
        requiresUserApproval: false,
      });

      this.emit('permission:approved', { requestId, permission });
    } else {
      resolve({
        granted: false,
        reason: 'Denied by user',
        requiresUserApproval: false,
      });

      this.emit('permission:denied', { requestId, request });
    }
  }

  /**
   * Check if permission is still valid
   */
  isValid(permission: Permission): boolean {
    if (permission.expiresAt && permission.expiresAt < Date.now()) {
      return false;
    }
    return true;
  }

  /**
   * Clean up expired permissions from a list
   */
  cleanupExpired(permissions: Permission[]): Permission[] {
    const now = Date.now();
    return permissions.filter(p => !p.expiresAt || p.expiresAt > now);
  }

  /**
   * Get all pending requests
   */
  getPendingRequests(): Array<{
    requestId: string;
    request: PermissionRequest;
    context: PermissionContext;
  }> {
    return Array.from(this.pendingRequests.entries()).map(([requestId, data]) => ({
      requestId,
      request: data.request,
      context: data.context,
    }));
  }

  /**
   * Cancel a pending request
   */
  cancelRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      this.pendingRequests.delete(requestId);
      pending.resolve({
        granted: false,
        reason: 'Request cancelled',
        requiresUserApproval: false,
      });
    }
  }

  /**
   * Update or add a policy
   */
  setPolicy(policy: PermissionPolicy): void {
    this.policies.set(policy.scope, policy);
  }

  /**
   * Get a policy
   */
  getPolicy(scope: PermissionScope): PermissionPolicy | undefined {
    return this.policies.get(scope);
  }

  /**
   * Check what permissions are required for a set of tools
   */
  getRequiredPermissions(tools: string[]): PermissionScope[] {
    const required: Set<PermissionScope> = new Set();

    for (const tool of tools) {
      switch (tool) {
        case 'Read':
          required.add('file_read');
          break;
        case 'Write':
        case 'Edit':
          required.add('file_write');
          break;
        case 'WebFetch':
          required.add('network_fetch');
          break;
        case 'Bash':
          required.add('system_exec');
          break;
        // MCP tools may require network connection
        default:
          if (tool.startsWith('mcp_')) {
            required.add('network_connect');
          }
      }
    }

    return Array.from(required);
  }

  /**
   * Find existing permission that satisfies the request
   */
  private findExistingPermission(
    request: PermissionRequest,
    existing: Permission[]
  ): Permission | undefined {
    const now = Date.now();

    return existing.find(p => {
      if (p.scope !== request.scope) return false;
      if (p.expiresAt && p.expiresAt < now) return false;

      // Check resource match
      if (request.resource && p.resource) {
        return this.matchResourcePattern(p.resource, request.resource);
      }

      // If no specific resource requested, any permission works
      return !request.resource || !p.resource;
    });
  }

  /**
   * Check if autonomy tier allows the permission scope
   */
  private checkAutonomyTier(scope: PermissionScope, tier: AutonomyTier): boolean {
    // Define what each tier allows
    const tierPermissions: Record<AutonomyTier, PermissionScope[]> = {
      observe_suggest: ['file_read', 'wallet_read'],
      plan_propose: ['file_read', 'wallet_read', 'network_fetch'],
      act_confirm: ['file_read', 'file_write', 'network_fetch', 'network_connect', 'wallet_read'],
      autonomous: ['file_read', 'file_write', 'network_fetch', 'network_connect', 'wallet_read', 'wallet_sign', 'wallet_send', 'system_exec'],
    };

    return tierPermissions[tier]?.includes(scope) || false;
  }

  /**
   * Match resource against pattern
   */
  private matchResourcePattern(pattern: string, resource: string): boolean {
    if (pattern === '*') return true;

    // Convert glob pattern to regex
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(resource);
  }
}
