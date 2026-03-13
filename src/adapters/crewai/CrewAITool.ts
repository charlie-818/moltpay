import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import type { WalletInfo, SupportedToken } from '../../types.js';
import { WalletManager } from '../../wallet/WalletManager.js';
import { TransactionBuilder } from '../../transaction/TransactionBuilder.js';
import { TransactionSender } from '../../transaction/TransactionSender.js';
import { PaymentVerifier } from '../../receipt/PaymentVerifier.js';
import { ReceiptGenerator } from '../../receipt/ReceiptGenerator.js';
import { TransactionHistory } from '../../receipt/TransactionHistory.js';
import { RateLimiter } from '../../security/RateLimiter.js';
import { FraudDetection } from '../../security/FraudDetection.js';
import { decryptKeypair } from '../../wallet/KeyStore.js';
import { CREWAI_TOOL_SCHEMAS } from './schemas.js';
import type {
  CrewAIToolConfig,
  CrewAIToolResult,
  CreateWalletResult,
  GetBalanceResult,
  SendPaymentResult,
  VerifyPaymentResult,
  TransactionHistoryResult,
  AirdropResult,
} from './types.js';

/**
 * MoltPay CrewAI Tool
 *
 * Provides Solana payment capabilities compatible with CrewAI agents.
 * All outputs are JSON strings for easy parsing in Python.
 *
 * @example
 * ```typescript
 * import { createCrewAITool } from 'moltpay';
 *
 * const moltpay = createCrewAITool({
 *   encryptionKey: process.env.MOLTPAY_KEY,
 *   network: 'devnet'
 * });
 *
 * // Create a wallet
 * const result = await moltpay.createWallet();
 * console.log(JSON.parse(result)); // { success: true, data: { publicKey: '...' } }
 * ```
 *
 * @example Python CrewAI integration
 * ```python
 * from crewai_tools import Tool
 * import subprocess
 * import json
 *
 * def moltpay_create_wallet():
 *     result = subprocess.run(['npx', 'moltpay', 'create-wallet'], capture_output=True)
 *     return json.loads(result.stdout)
 *
 * wallet_tool = Tool(
 *     name="Create Solana Wallet",
 *     description="Create a new Solana wallet",
 *     func=moltpay_create_wallet
 * )
 * ```
 */
export class CrewAITool {
  private walletManager: WalletManager;
  private connection: Connection;
  private transactionBuilder: TransactionBuilder;
  private transactionSender: TransactionSender;
  private paymentVerifier: PaymentVerifier;
  private transactionHistory: TransactionHistory;
  private rateLimiter: RateLimiter;
  private fraudDetection: FraudDetection;
  private config: CrewAIToolConfig;

  private activeWallet?: WalletInfo & { salt: string };

  constructor(config: CrewAIToolConfig) {
    this.config = config;

    const rpcEndpoint = config.rpcEndpoint || clusterApiUrl(config.network || 'devnet');
    this.connection = new Connection(rpcEndpoint, 'confirmed');

    this.walletManager = new WalletManager({
      encryptionKey: config.encryptionKey,
      rpcEndpoint,
    });

    const isDevnet = config.network !== 'mainnet-beta';
    this.transactionBuilder = new TransactionBuilder(this.connection, isDevnet);
    this.transactionSender = new TransactionSender(this.connection);
    this.paymentVerifier = new PaymentVerifier(this.connection, isDevnet);
    this.transactionHistory = new TransactionHistory(this.connection);
    this.rateLimiter = new RateLimiter({ maxTransactions: 10, windowMs: 60000 });
    this.fraudDetection = new FraudDetection();
  }

  /**
   * Creates a new wallet
   * Returns JSON string for Python compatibility
   */
  async createWallet(): Promise<string> {
    try {
      const wallet = this.walletManager.createWallet();
      this.activeWallet = wallet;

      const result: CrewAIToolResult<CreateWalletResult> = {
        success: true,
        data: {
          publicKey: wallet.publicKey,
          createdAt: wallet.createdAt,
        },
      };

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create wallet',
      });
    }
  }

  /**
   * Gets balance for a wallet
   * Returns JSON string for Python compatibility
   */
  async getBalance(params: {
    publicKey: string;
    tokens?: string[];
  }): Promise<string> {
    try {
      const balance = await this.walletManager.getBalance(
        params.publicKey,
        params.tokens || []
      );

      const result: CrewAIToolResult<GetBalanceResult> = {
        success: true,
        data: {
          sol: balance.sol,
          tokens: balance.tokens.map((t) => ({
            symbol: t.symbol,
            mint: t.mint,
            amount: t.uiAmount,
          })),
        },
      };

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get balance',
      });
    }
  }

  /**
   * Sends SOL or tokens
   * Returns JSON string for Python compatibility
   */
  async sendPayment(params: {
    to: string;
    amount: number;
    token?: SupportedToken | string;
    memo?: string;
  }): Promise<string> {
    if (!this.activeWallet) {
      return JSON.stringify({
        success: false,
        error: 'No active wallet. Create a wallet first.',
      });
    }

    // Check rate limit
    const rateStatus = this.rateLimiter.check(this.activeWallet.publicKey);
    if (rateStatus.exceeded) {
      return JSON.stringify({
        success: false,
        error: `Rate limited. Try again at ${new Date(rateStatus.resetAt).toISOString()}`,
      });
    }

    // Check fraud detection
    const fraudCheck = this.fraudDetection.check(
      this.activeWallet.publicKey,
      params.amount
    );
    if (!fraudCheck.allowed) {
      return JSON.stringify({
        success: false,
        error: `Transaction blocked: ${fraudCheck.flags.join(', ')}`,
      });
    }

    try {
      // Decrypt keypair
      const keypair = decryptKeypair(this.activeWallet, this.config.encryptionKey);

      // Build transaction
      const built = await this.transactionBuilder.buildTransfer({
        sender: keypair,
        recipient: new PublicKey(params.to),
        amount: params.amount,
        token: params.token || 'SOL',
        memo: params.memo,
      });

      // Send and confirm
      const result = await this.transactionSender.signSendAndConfirm(
        built.transaction,
        [keypair]
      );

      // Record for rate limiting and fraud detection
      this.rateLimiter.consume(this.activeWallet.publicKey);
      if (result.status !== 'failed') {
        this.fraudDetection.record(
          this.activeWallet.publicKey,
          params.amount,
          result.signature
        );
      }

      // Generate receipt
      const receipt = ReceiptGenerator.fromTransactionResult(
        result,
        this.activeWallet.publicKey,
        params.to,
        params.amount,
        params.token || 'SOL'
      );

      const response: CrewAIToolResult<SendPaymentResult> = {
        success: result.status !== 'failed',
        data: {
          success: result.status !== 'failed',
          signature: result.signature,
          status: result.status,
          receiptId: receipt.receiptId,
          error: result.error,
        },
      };

      return JSON.stringify(response);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Verifies a payment
   * Returns JSON string for Python compatibility
   */
  async verifyPayment(params: {
    signature: string;
    expectedRecipient?: string;
    expectedAmount?: number;
    expectedToken?: string;
  }): Promise<string> {
    try {
      const receipt = await this.paymentVerifier.verifyPayment({
        signature: params.signature,
        expectedRecipient: params.expectedRecipient,
        expectedAmount: params.expectedAmount,
        expectedToken: params.expectedToken,
      });

      const result: CrewAIToolResult<VerifyPaymentResult> = {
        success: true,
        data: {
          verified: receipt.verified,
          receipt: receipt.verified
            ? {
                receiptId: receipt.receiptId,
                from: receipt.from,
                to: receipt.to,
                amount: receipt.amount,
                token: receipt.token,
                timestamp: receipt.timestamp,
              }
            : undefined,
          failures: receipt.failures,
        },
      };

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify payment',
      });
    }
  }

  /**
   * Gets transaction history
   * Returns JSON string for Python compatibility
   */
  async getTransactionHistory(params: {
    publicKey: string;
    limit?: number;
    direction?: 'sent' | 'received' | 'all';
  }): Promise<string> {
    try {
      const history = await this.transactionHistory.getHistory(params.publicKey, {
        limit: params.limit || 10,
        direction: params.direction || 'all',
      });

      const result: CrewAIToolResult<TransactionHistoryResult> = {
        success: true,
        data: {
          transactions: history.map((tx) => ({
            signature: tx.signature,
            from: tx.from,
            to: tx.to,
            amount: tx.amount,
            token: tx.token,
            timestamp: tx.timestamp,
            status: tx.status,
          })),
        },
      };

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get history',
      });
    }
  }

  /**
   * Requests an airdrop (devnet only)
   * Returns JSON string for Python compatibility
   */
  async requestAirdrop(params: {
    publicKey: string;
    amount?: number;
  }): Promise<string> {
    if (this.config.network === 'mainnet-beta') {
      return JSON.stringify({
        success: false,
        error: 'Airdrop not available on mainnet',
      });
    }

    try {
      const signature = await this.walletManager.requestAirdrop(
        params.publicKey,
        params.amount || 1
      );

      const result: CrewAIToolResult<AirdropResult> = {
        success: true,
        data: {
          success: true,
          signature,
        },
      };

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Airdrop failed',
      });
    }
  }

  /**
   * Sets the active wallet
   */
  setActiveWallet(wallet: WalletInfo & { salt: string }): void {
    this.activeWallet = wallet;
  }

  /**
   * Gets the active wallet public key
   */
  getActiveWalletPublicKey(): string | undefined {
    return this.activeWallet?.publicKey;
  }

  /**
   * Gets tool definitions for CrewAI
   */
  static getToolSchemas(): typeof CREWAI_TOOL_SCHEMAS {
    return CREWAI_TOOL_SCHEMAS;
  }

  /**
   * Creates tool functions compatible with CrewAI
   * Each function accepts a JSON string input and returns a JSON string output
   */
  getToolFunctions(): Record<string, (input: string) => Promise<string>> {
    return {
      moltpay_create_wallet: async () => this.createWallet(),

      moltpay_get_balance: async (input: string) => {
        const params = JSON.parse(input);
        return this.getBalance(params);
      },

      moltpay_send_payment: async (input: string) => {
        const params = JSON.parse(input);
        return this.sendPayment(params);
      },

      moltpay_verify_payment: async (input: string) => {
        const params = JSON.parse(input);
        return this.verifyPayment(params);
      },

      moltpay_get_history: async (input: string) => {
        const params = JSON.parse(input);
        return this.getTransactionHistory(params);
      },

      moltpay_request_airdrop: async (input: string) => {
        const params = JSON.parse(input);
        return this.requestAirdrop(params);
      },
    };
  }

  /**
   * Executes a tool by name with JSON input
   * Useful for dynamic tool invocation
   */
  async executeTool(toolName: string, inputJson: string): Promise<string> {
    const tools = this.getToolFunctions();
    const tool = tools[toolName];

    if (!tool) {
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolName}`,
      });
    }

    try {
      return await tool(inputJson);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      });
    }
  }
}

/**
 * Creates a CrewAI tool instance from environment configuration
 */
export function createCrewAITool(config?: Partial<CrewAIToolConfig>): CrewAITool {
  const fullConfig: CrewAIToolConfig = {
    encryptionKey: config?.encryptionKey || process.env.MOLTPAY_ENCRYPTION_KEY || '',
    rpcEndpoint: config?.rpcEndpoint || process.env.MOLTPAY_RPC_ENDPOINT,
    network: (config?.network || process.env.MOLTPAY_NETWORK || 'devnet') as
      | 'devnet'
      | 'mainnet-beta',
  };

  if (!fullConfig.encryptionKey) {
    throw new Error(
      'MOLTPAY_ENCRYPTION_KEY environment variable or encryptionKey config required'
    );
  }

  return new CrewAITool(fullConfig);
}
