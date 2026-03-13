import { EventEmitter } from 'events';
import {
  InstalledSkill,
  SkillMetadata,
  Permission,
  PermissionRequest,
  AutonomyTier,
  SkillSource,
  TrustLevel,
  IntentPreview,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillExecutionStep,
  MarketplaceSkill,
  McpToolAsSkill,
  SkillError,
  PermissionError,
} from './types';
import { SkillRegistry, SkillQuery } from './SkillRegistry';
import { SkillLoader, LoadOptions, LoadResult } from './SkillLoader';
import { SkillValidator } from './SkillValidator';

export interface SkillManagerConfig {
  dbPath?: string;
  skillDirectories?: string[];
  autoWatchDirectories?: boolean;
  defaultAutonomyTier?: AutonomyTier;
}

export interface InstallOptions extends LoadOptions {
  autonomyTier?: AutonomyTier;
  grantPermissions?: Permission[];
}

export type SkillEventType =
  | 'skill:installed'
  | 'skill:uninstalled'
  | 'skill:enabled'
  | 'skill:disabled'
  | 'skill:updated'
  | 'skill:execution:start'
  | 'skill:execution:complete'
  | 'skill:execution:error'
  | 'permission:requested'
  | 'permission:granted'
  | 'permission:denied';

export class SkillManager extends EventEmitter {
  private registry: SkillRegistry;
  private loader: SkillLoader;
  private validator: SkillValidator;
  private config: SkillManagerConfig;
  private watchers: Map<string, () => void> = new Map();
  private activeExecutions: Map<string, SkillExecutionContext> = new Map();

  constructor(config: SkillManagerConfig = {}) {
    super();
    this.config = config;
    this.registry = new SkillRegistry({ dbPath: config.dbPath });
    this.loader = new SkillLoader();
    this.validator = new SkillValidator();

    // Set up directory watching
    if (config.autoWatchDirectories && config.skillDirectories) {
      for (const dir of config.skillDirectories) {
        this.watchDirectory(dir);
      }
    }
  }

  // =========================================================================
  // Installation Methods
  // =========================================================================

  /**
   * Install a skill from a local file
   */
  async installFromFile(
    filePath: string,
    options: InstallOptions = {}
  ): Promise<InstalledSkill> {
    const result = await this.loader.loadFromFile(filePath, options);
    return this.completeInstall(result, options);
  }

  /**
   * Install a skill from raw content
   */
  async installFromContent(
    content: string,
    source: SkillSource,
    sourcePath: string,
    options: InstallOptions = {}
  ): Promise<InstalledSkill> {
    const result = await this.loader.loadFromContent(content, source, sourcePath, options);
    return this.completeInstall(result, options);
  }

  /**
   * Install a skill from the marketplace
   */
  async installFromMarketplace(
    marketplaceSkill: MarketplaceSkill,
    downloadedContent: string,
    options: InstallOptions = {}
  ): Promise<InstalledSkill> {
    // Parse and validate the downloaded content
    const parsed = this.validator.parseSkillContent(downloadedContent);
    const validation = this.validator.validate(parsed);

    if (!validation.valid) {
      throw new SkillError(
        `Marketplace skill validation failed: ${validation.errors.join(', ')}`,
        'VALIDATION_ERROR',
        { errors: validation.errors }
      );
    }

    // Create installed skill from marketplace metadata
    const skill = this.loader.loadFromMarketplace(marketplaceSkill);
    skill.instructions = parsed.instructions;

    // Merge marketplace metadata with parsed metadata
    const parsedMetadata = this.validator.toMetadata(parsed, skill.id);
    skill.metadata = {
      ...parsedMetadata,
      ...marketplaceSkill.metadata,
    };

    return this.completeInstall({ skill, validation }, options);
  }

  /**
   * Install an MCP tool as a skill
   */
  installMcpTool(tool: McpToolAsSkill, options: InstallOptions = {}): InstalledSkill {
    const skill = this.loader.mcpToolToSkill(tool);

    if (options.autonomyTier) {
      skill.autonomyTier = options.autonomyTier;
    }

    if (options.grantPermissions) {
      skill.grantedPermissions = options.grantPermissions;
    }

    this.registry.register(skill);
    this.emit('skill:installed', skill);

    return skill;
  }

  /**
   * Scan and install all skills from a directory
   */
  async installFromDirectory(
    dirPath: string,
    options: InstallOptions = {}
  ): Promise<InstalledSkill[]> {
    const results = await this.loader.loadFromDirectory(dirPath, options);
    const installed: InstalledSkill[] = [];

    for (const result of results) {
      const skill = await this.completeInstall(result, options);
      installed.push(skill);
    }

    return installed;
  }

  /**
   * Complete installation process
   */
  private async completeInstall(
    result: LoadResult,
    options: InstallOptions
  ): Promise<InstalledSkill> {
    const { skill } = result;

    if (options.autonomyTier) {
      skill.autonomyTier = options.autonomyTier;
    } else if (this.config.defaultAutonomyTier) {
      skill.autonomyTier = this.config.defaultAutonomyTier;
    }

    if (options.grantPermissions) {
      skill.grantedPermissions = options.grantPermissions;
    }

    this.registry.register(skill);
    this.emit('skill:installed', skill);

    return skill;
  }

  // =========================================================================
  // Uninstallation & Management
  // =========================================================================

  /**
   * Uninstall a skill
   */
  uninstall(skillId: string): boolean {
    const skill = this.registry.get(skillId);
    if (!skill) return false;

    const success = this.registry.unregister(skillId);
    if (success) {
      this.emit('skill:uninstalled', skill);
    }

    return success;
  }

  /**
   * Enable a skill
   */
  enable(skillId: string): void {
    const skill = this.registry.get(skillId);
    if (!skill) throw new SkillError(`Skill not found: ${skillId}`, 'NOT_FOUND');

    this.registry.setEnabled(skillId, true);
    this.emit('skill:enabled', { ...skill, enabled: true });
  }

  /**
   * Disable a skill
   */
  disable(skillId: string): void {
    const skill = this.registry.get(skillId);
    if (!skill) throw new SkillError(`Skill not found: ${skillId}`, 'NOT_FOUND');

    this.registry.setEnabled(skillId, false);
    this.emit('skill:disabled', { ...skill, enabled: false });
  }

  /**
   * Update skill autonomy tier
   */
  setAutonomyTier(skillId: string, tier: AutonomyTier): void {
    const skill = this.registry.get(skillId);
    if (!skill) throw new SkillError(`Skill not found: ${skillId}`, 'NOT_FOUND');

    this.registry.setAutonomyTier(skillId, tier);
    this.emit('skill:updated', { ...skill, autonomyTier: tier });
  }

  // =========================================================================
  // Query Methods
  // =========================================================================

  /**
   * Get a skill by ID
   */
  get(skillId: string): InstalledSkill | null {
    return this.registry.get(skillId);
  }

  /**
   * Get all installed skills
   */
  getAll(): InstalledSkill[] {
    return this.registry.getAll();
  }

  /**
   * Get enabled skills only
   */
  getEnabled(): InstalledSkill[] {
    return this.registry.query({ enabled: true });
  }

  /**
   * Query skills with filters
   */
  query(query: SkillQuery): InstalledSkill[] {
    return this.registry.query(query);
  }

  /**
   * Search skills by text
   */
  search(text: string, limit?: number): InstalledSkill[] {
    return this.registry.query({ search: text, limit });
  }

  /**
   * Get skills by source
   */
  getBySource(source: SkillSource): InstalledSkill[] {
    return this.registry.query({ source });
  }

  /**
   * Get skill counts by source
   */
  getCountsBySource(): Record<SkillSource, number> {
    return this.registry.countBySource();
  }

  // =========================================================================
  // Permission Management
  // =========================================================================

  /**
   * Request permissions for a skill
   */
  async requestPermissions(
    skillId: string,
    requests: PermissionRequest[]
  ): Promise<Permission[]> {
    const skill = this.registry.get(skillId);
    if (!skill) throw new SkillError(`Skill not found: ${skillId}`, 'NOT_FOUND');

    const granted: Permission[] = [];

    for (const request of requests) {
      this.emit('permission:requested', { skillId, request });

      // Check if permission should be auto-granted based on trust level
      const autoGrant = this.shouldAutoGrant(skill.metadata.trustLevel, request);

      if (autoGrant) {
        const permission: Permission = {
          scope: request.scope,
          resource: request.resource,
          expiresAt: request.duration ? Date.now() + request.duration : undefined,
          grantedAt: Date.now(),
          grantedBy: 'system',
        };

        this.registry.addPermission(skillId, permission);
        granted.push(permission);
        this.emit('permission:granted', { skillId, permission });
      } else {
        // Permission requires user approval - this would be handled by the UI
        throw new PermissionError(
          `Permission requires user approval: ${request.scope}`,
          { request }
        );
      }
    }

    return granted;
  }

  /**
   * Grant a permission
   */
  grantPermission(skillId: string, permission: Permission): void {
    const skill = this.registry.get(skillId);
    if (!skill) throw new SkillError(`Skill not found: ${skillId}`, 'NOT_FOUND');

    this.registry.addPermission(skillId, permission);
    this.emit('permission:granted', { skillId, permission });
  }

  /**
   * Revoke a permission
   */
  revokePermission(skillId: string, scope: string, resource?: string): void {
    this.registry.revokePermission(skillId, scope, resource);
    this.emit('permission:denied', { skillId, scope, resource });
  }

  /**
   * Check if a skill has a specific permission
   */
  hasPermission(skillId: string, scope: string, resource?: string): boolean {
    const skill = this.registry.get(skillId);
    if (!skill) return false;

    const permissions = skill.grantedPermissions;
    const now = Date.now();

    return permissions.some(p => {
      if (p.scope !== scope) return false;
      if (p.expiresAt && p.expiresAt < now) return false;
      if (resource && p.resource && !this.resourceMatches(p.resource, resource)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get all permissions for a skill
   */
  getPermissions(skillId: string): Permission[] {
    return this.registry.getPermissions(skillId);
  }

  /**
   * Check if resource matches pattern
   */
  private resourceMatches(pattern: string, resource: string): boolean {
    // Simple glob matching
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return resource.startsWith(prefix);
    }
    return pattern === resource;
  }

  /**
   * Determine if permission should be auto-granted based on trust level
   */
  private shouldAutoGrant(trustLevel: TrustLevel, request: PermissionRequest): boolean {
    // System-level skills get all permissions auto-granted
    if (trustLevel === 'system') return true;

    // Verified skills get read-only permissions auto-granted
    if (trustLevel === 'verified') {
      const readOnlyScopes = ['file_read', 'network_fetch', 'wallet_read'];
      return readOnlyScopes.includes(request.scope);
    }

    // Community and untrusted require user approval for everything
    return false;
  }

  // =========================================================================
  // Execution Methods
  // =========================================================================

  /**
   * Generate an intent preview for skill execution
   */
  generateIntentPreview(
    skillId: string,
    action: string,
    steps: Array<{ description: string; requiresApproval?: boolean; approvalType?: string }>
  ): IntentPreview {
    const skill = this.registry.get(skillId);
    if (!skill) throw new SkillError(`Skill not found: ${skillId}`, 'NOT_FOUND');

    return {
      skillId,
      skillName: skill.metadata.name,
      action,
      steps: steps.map((step, index) => ({
        id: `step-${index}`,
        description: step.description,
        status: 'pending',
        requiresApproval: step.requiresApproval,
        approvalType: step.approvalType as SkillExecutionStep['approvalType'],
      })),
    };
  }

  /**
   * Start skill execution tracking
   */
  startExecution(skillId: string): SkillExecutionContext {
    const skill = this.registry.get(skillId);
    if (!skill) throw new SkillError(`Skill not found: ${skillId}`, 'NOT_FOUND');

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const context: SkillExecutionContext = {
      skillId,
      executionId,
      autonomyTier: skill.autonomyTier,
      permissions: skill.grantedPermissions,
      startedAt: Date.now(),
    };

    this.activeExecutions.set(executionId, context);
    this.registry.updateLastUsed(skillId);
    this.emit('skill:execution:start', context);

    return context;
  }

  /**
   * Complete skill execution
   */
  completeExecution(
    executionId: string,
    result: Omit<SkillExecutionResult, 'executionId' | 'skillId' | 'startedAt' | 'completedAt'>
  ): SkillExecutionResult {
    const context = this.activeExecutions.get(executionId);
    if (!context) {
      throw new SkillError(`Execution not found: ${executionId}`, 'EXECUTION_NOT_FOUND');
    }

    const fullResult: SkillExecutionResult = {
      ...result,
      executionId,
      skillId: context.skillId,
      startedAt: context.startedAt,
      completedAt: Date.now(),
    };

    this.activeExecutions.delete(executionId);

    if (result.success) {
      this.emit('skill:execution:complete', fullResult);
    } else {
      this.emit('skill:execution:error', fullResult);
    }

    return fullResult;
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): SkillExecutionContext[] {
    return Array.from(this.activeExecutions.values());
  }

  // =========================================================================
  // Directory Watching
  // =========================================================================

  /**
   * Watch a directory for skill changes
   */
  watchDirectory(dirPath: string): void {
    if (this.watchers.has(dirPath)) {
      return; // Already watching
    }

    const stop = this.loader.watchDirectory(dirPath, {
      onAdd: async (result) => {
        try {
          await this.completeInstall(result, {});
        } catch (error) {
          console.error('Failed to install new skill:', error);
        }
      },
      onRemove: (filePath) => {
        // Find and uninstall skill by source path
        const skills = this.query({});
        const skill = skills.find(s => s.sourcePath === filePath);
        if (skill) {
          this.uninstall(skill.id);
        }
      },
      onChange: async (result) => {
        // Re-install with updated content
        try {
          await this.completeInstall(result, {});
          this.emit('skill:updated', result.skill);
        } catch (error) {
          console.error('Failed to update skill:', error);
        }
      },
    });

    this.watchers.set(dirPath, stop);
  }

  /**
   * Stop watching a directory
   */
  unwatchDirectory(dirPath: string): void {
    const stop = this.watchers.get(dirPath);
    if (stop) {
      stop();
      this.watchers.delete(dirPath);
    }
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Clean up expired licenses
   */
  cleanupExpiredLicenses(): InstalledSkill[] {
    const expired = this.registry.getExpiredLicenses();

    for (const skill of expired) {
      // Disable skills with expired licenses
      this.disable(skill.id);
    }

    return expired;
  }

  /**
   * Close the skill manager
   */
  close(): void {
    // Stop all watchers
    for (const stop of this.watchers.values()) {
      stop();
    }
    this.watchers.clear();

    // Close registry
    this.registry.close();
  }
}
