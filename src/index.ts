// Wallet & Agent
export * from './wallet';
export * from './agent';

// Skills System
export * from './skills';
export * from './security';
export * from './mcp';
export * from './payments';

// MoltPay SDK - Core Types (excluding duplicates)
export type {
  WalletConfig,
  WalletInfo,
  HDWalletConfig,
  HDWalletInfo,
  Balance,
  TokenBalance,
  SupportedToken,
  SendOptions,
  TransactionResult,
  TransactionDetails,
  VerifyPaymentOptions,
  PaymentReceipt,
  TransactionHistoryOptions,
  RateLimitConfig,
  RateLimitStatus,
  FraudDetectionConfig,
  FraudCheckResult,
  MoltPayConfig,
  AgentPaymentRequest,
  AgentPaymentResponse,
} from './types.js';
export { TOKEN_MINTS, DEVNET_TOKEN_MINTS } from './types.js';

// MoltPay SDK - Transaction Module (excluding TransactionResult to avoid duplicate)
export {
  TransactionBuilder,
  TransactionSender,
  ConfirmationWatcher,
} from './transaction/index.js';

// MoltPay SDK - Receipt Module (excluding PaymentReceipt to avoid duplicate)
export {
  PaymentVerifier,
  ReceiptGenerator,
  TransactionHistory,
} from './receipt/index.js';

// MoltPay SDK - Agent Adapters
export { MoltPaySkill, createMoltPaySkill } from './adapters/openclaw/index.js';
export { MoltPayTool, createMoltPayTool, MOLTPAY_TOOL_SCHEMAS } from './adapters/langchain/index.js';
export { CrewAITool, createCrewAITool, CREWAI_TOOL_SCHEMAS } from './adapters/crewai/index.js';

// MoltPay SDK - REST API
export {
  createApiServer,
  startApiServer,
  createAndStartApiServer,
  ApiError,
} from './adapters/api/index.js';

import { AgentTransactionAPI, AgentConfig } from './agent';
import { SkillManager, SkillManagerConfig } from './skills';
import { McpClientManager } from './mcp';
import { PaymentManager, PaymentManagerConfig } from './payments';
import { LicenseManager, LicenseManagerConfig } from './payments';
import { AuditLogger, AuditLogConfig } from './security';

// MoltPay SDK imports
import { Connection, clusterApiUrl } from '@solana/web3.js';
import type { MoltPayConfig } from './types.js';
import { WalletManager } from './wallet/WalletManager.js';
import { TransactionBuilder } from './transaction/TransactionBuilder.js';
import { TransactionSender } from './transaction/TransactionSender.js';
import { ConfirmationWatcher } from './transaction/ConfirmationWatcher.js';
import { PaymentVerifier } from './receipt/PaymentVerifier.js';
import { ReceiptGenerator } from './receipt/ReceiptGenerator.js';
import { TransactionHistory } from './receipt/TransactionHistory.js';
import { RateLimiter } from './security/RateLimiter.js';
import { FraudDetection } from './security/FraudDetection.js';

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

// ============================================================
// MoltPay SDK - Main Class
// ============================================================

/**
 * MoltPay SDK - Solana Payment Processing for AI Agents
 *
 * Provides a unified interface for wallet management, transactions,
 * payment verification, and integration with AI agent frameworks.
 *
 * @example
 * ```typescript
 * import { MoltPay } from 'moltpay';
 *
 * const moltpay = new MoltPay({
 *   encryptionKey: process.env.MOLTPAY_KEY,
 *   rpcEndpoint: 'https://api.devnet.solana.com'
 * });
 *
 * // Create a wallet
 * const wallet = moltpay.createWallet();
 *
 * // Send payment
 * const result = await moltpay.send({
 *   to: 'recipient-public-key',
 *   amount: 1.5,
 *   token: 'SOL'
 * });
 * ```
 */
export class MoltPay {
  public readonly wallet: WalletManager;
  public readonly transactions: TransactionBuilder;
  public readonly sender: TransactionSender;
  public readonly watcher: ConfirmationWatcher;
  public readonly verifier: PaymentVerifier;
  public readonly receipts: typeof ReceiptGenerator;
  public readonly history: TransactionHistory;
  public readonly rateLimiter: RateLimiter;
  public readonly fraudDetection: FraudDetection;

  private connection: Connection;
  private config: MoltPayConfig;

  constructor(config: MoltPayConfig = {}) {
    this.config = config;

    const rpcEndpoint = config.rpcEndpoint || clusterApiUrl('devnet');
    this.connection = new Connection(rpcEndpoint, config.commitment || 'confirmed');

    // Initialize modules
    this.wallet = new WalletManager({
      encryptionKey: config.encryptionKey,
      rpcEndpoint,
    });

    this.transactions = new TransactionBuilder(this.connection, true);
    this.sender = new TransactionSender(this.connection);
    this.watcher = new ConfirmationWatcher(this.connection);
    this.verifier = new PaymentVerifier(this.connection, true);
    this.receipts = ReceiptGenerator;
    this.history = new TransactionHistory(this.connection);

    // Security modules
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.fraudDetection = new FraudDetection(config.fraudDetection);
  }

  /**
   * Gets the Solana connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Gets the current configuration
   */
  getConfig(): MoltPayConfig {
    return { ...this.config };
  }
}

/**
 * Creates a new MoltPay instance with configuration from environment
 */
export function createMoltPay(config?: Partial<MoltPayConfig>): MoltPay {
  return new MoltPay({
    encryptionKey: config?.encryptionKey || process.env.MOLTPAY_ENCRYPTION_KEY,
    rpcEndpoint: config?.rpcEndpoint || process.env.MOLTPAY_RPC_ENDPOINT,
    commitment: config?.commitment || 'confirmed',
    ...config,
  });
}
