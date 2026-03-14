import { z } from 'zod';

// ============================================================================
// Trust & Security Types
// ============================================================================

export type TrustLevel = 'system' | 'verified' | 'community' | 'untrusted';

export type AutonomyTier =
  | 'observe_suggest'    // Notifications only
  | 'plan_propose'       // User reviews plans before execution
  | 'act_confirm'        // Prepare autonomously, approve final action
  | 'autonomous';        // Pre-approved task types

export type PermissionScope =
  | 'file_read'
  | 'file_write'
  | 'network_fetch'
  | 'network_connect'
  | 'wallet_read'
  | 'wallet_sign'
  | 'wallet_send'
  | 'system_exec';

export interface Permission {
  scope: PermissionScope;
  resource?: string;      // Specific resource (file path, host, etc.)
  expiresAt?: number;     // Timestamp when permission expires
  grantedAt: number;
  grantedBy: 'user' | 'system' | 'parent_skill';
}

export interface PermissionRequest {
  scope: PermissionScope;
  resource?: string;
  reason: string;
  duration?: number;      // Duration in milliseconds
}

// ============================================================================
// SKILL.md Schema (Agent Skills Standard)
// ============================================================================

export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  version: z.string().optional().default('1.0.0'),
  license: z.string().optional().default('MIT'),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  'allowed-tools': z.string().optional(),  // Space-separated tool names
  'required-tools': z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  pricing: z.object({
    model: z.enum(['free', 'one-time', 'subscription', 'usage']),
    amount: z.number().optional(),
    currency: z.string().optional().default('SOL'),
    interval: z.enum(['daily', 'weekly', 'monthly']).optional(),
  }).optional(),
  permissions: z.array(z.string()).optional().default([]),
  'trust-level': z.enum(['system', 'verified', 'community', 'untrusted']).optional(),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  instructions: string;
  rawContent: string;
}

// ============================================================================
// Skill Definition & Metadata
// ============================================================================

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  license: string;
  tags: string[];
  allowedTools: string[];
  requiredTools: string[];
  permissions: PermissionScope[];
  trustLevel: TrustLevel;
  pricing?: SkillPricing;

  // Marketplace metadata
  publisherId?: string;
  publisherName?: string;
  signature?: string;
  installCount?: number;
  rating?: number;
  reviewCount?: number;
  lastUpdated?: number;
  certifications?: string[];  // e.g., 'AIUC-1', 'Audited'
}

export interface SkillPricing {
  model: 'free' | 'one-time' | 'subscription' | 'usage';
  amount?: number;
  currency: string;
  interval?: 'daily' | 'weekly' | 'monthly';
  usageUnit?: string;  // e.g., 'execution', 'token', 'minute'
}

export interface InstalledSkill {
  id: string;
  metadata: SkillMetadata;
  instructions: string;
  source: SkillSource;
  sourcePath: string;       // File path, URL, or MCP server ID
  installedAt: number;
  lastUsedAt?: number;
  enabled: boolean;
  autonomyTier: AutonomyTier;
  grantedPermissions: Permission[];
  licenseKey?: string;
  licenseExpiresAt?: number;
}

export type SkillSource = 'local' | 'marketplace' | 'mcp';

// ============================================================================
// Skill Execution Types
// ============================================================================

export interface SkillExecutionContext {
  skillId: string;
  executionId: string;
  autonomyTier: AutonomyTier;
  permissions: Permission[];
  startedAt: number;
}

export interface SkillExecutionStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'requires_approval';
  result?: unknown;
  error?: string;
  requiresApproval?: boolean;
  approvalType?: 'wallet_sign' | 'file_write' | 'network' | 'other';
}

export interface IntentPreview {
  skillId: string;
  skillName: string;
  action: string;
  steps: SkillExecutionStep[];
  estimatedCost?: {
    amount: number;
    currency: string;
  };
  warnings?: string[];
}

export interface SkillExecutionResult {
  success: boolean;
  executionId: string;
  skillId: string;
  startedAt: number;
  completedAt: number;
  steps: SkillExecutionStep[];
  output?: unknown;
  error?: string;
}

// ============================================================================
// MCP Integration Types
// ============================================================================

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;        // For stdio transport
  args?: string[];
  url?: string;            // For http/sse transport
  headers?: Record<string, string>;
  trustLevel: TrustLevel;
  enabled: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}

export interface McpToolAsSkill extends SkillMetadata {
  source: 'mcp';
  mcpServerId: string;
  mcpToolName: string;
  inputSchema?: Record<string, unknown>;
}

// ============================================================================
// Marketplace Types
// ============================================================================

export interface MarketplaceSkill {
  id: string;
  metadata: SkillMetadata;
  downloadUrl: string;
  previewInstructions?: string;  // Truncated instructions for preview
  screenshots?: string[];
  dependencies?: string[];
}

export interface MarketplaceSearchParams {
  query?: string;
  tags?: string[];
  trustLevel?: TrustLevel[];
  pricingModel?: SkillPricing['model'][];
  sortBy?: 'relevance' | 'popularity' | 'rating' | 'recent';
  limit?: number;
  offset?: number;
}

export interface MarketplaceSearchResult {
  skills: MarketplaceSkill[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// License & Payment Types
// ============================================================================

export interface License {
  id: string;
  skillId: string;
  purchaserId: string;    // Wallet address
  type: 'perpetual' | 'subscription' | 'usage';
  issuedAt: number;
  expiresAt?: number;
  usageRemaining?: number;
  signature: string;      // Publisher signature
  receiptSignature: string;  // Transaction signature
}

export interface PurchaseParams {
  skillId: string;
  pricingModel: SkillPricing['model'];
  amount: number;
  currency: string;
  payerWallet: string;
  recipientWallet: string;
}

export interface PurchaseResult {
  success: boolean;
  transactionSignature?: string;
  license?: License;
  error?: string;
}

// ============================================================================
// Audit Log Types
// ============================================================================

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  skillId?: string;
  executionId?: string;
  action: string;
  details: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'pending';
  errorMessage?: string;
}

export type AuditEventType =
  | 'skill_installed'
  | 'skill_uninstalled'
  | 'skill_enabled'
  | 'skill_disabled'
  | 'skill_executed'
  | 'permission_granted'
  | 'permission_revoked'
  | 'permission_denied'
  | 'payment_initiated'
  | 'payment_completed'
  | 'payment_failed'
  | 'mcp_connected'
  | 'mcp_disconnected'
  | 'sandbox_violation';

// ============================================================================
// Error Types
// ============================================================================

export class SkillError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SkillError';
  }
}

export class SkillParseError extends SkillError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SKILL_PARSE_ERROR', details);
    this.name = 'SkillParseError';
  }
}

export class SkillValidationError extends SkillError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SKILL_VALIDATION_ERROR', details);
    this.name = 'SkillValidationError';
  }
}

export class PermissionError extends SkillError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PERMISSION_ERROR', details);
    this.name = 'PermissionError';
  }
}

export class SandboxError extends SkillError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SANDBOX_ERROR', details);
    this.name = 'SandboxError';
  }
}

export class LicenseError extends SkillError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'LICENSE_ERROR', details);
    this.name = 'LicenseError';
  }
}

export class McpError extends SkillError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'MCP_ERROR', details);
    this.name = 'McpError';
  }
}
