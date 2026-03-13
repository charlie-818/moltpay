// Wallet & Agent
export * from './wallet';
export * from './agent';

// Skills System
export * from './skills';
export * from './security';
export * from './mcp';
export * from './payments';

import { AgentTransactionAPI, AgentConfig } from './agent';
import { SkillManager, SkillManagerConfig } from './skills';
import { McpClientManager } from './mcp';
import { PaymentManager, PaymentManagerConfig } from './payments';
import { LicenseManager, LicenseManagerConfig } from './payments';
import { AuditLogger, AuditLogConfig } from './security';

/**
 * Create a new agent transaction API instance
 */
export function createAgentAPI(config?: AgentConfig): AgentTransactionAPI {
  return new AgentTransactionAPI(config);
}

/**
 * Create a new skill manager instance
 */
export function createSkillManager(config?: SkillManagerConfig): SkillManager {
  return new SkillManager(config);
}

/**
 * Create a new MCP client manager instance
 */
export function createMcpManager(): McpClientManager {
  return new McpClientManager();
}

/**
 * Create a new payment manager instance
 */
export function createPaymentManager(config: PaymentManagerConfig): PaymentManager {
  return new PaymentManager(config);
}

/**
 * Create a new license manager instance
 */
export function createLicenseManager(config?: LicenseManagerConfig): LicenseManager {
  return new LicenseManager(config);
}

/**
 * Create a new audit logger instance
 */
export function createAuditLogger(config?: AuditLogConfig): AuditLogger {
  return new AuditLogger(config);
}
