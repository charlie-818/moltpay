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

/**
 * LangChain tool configuration
 */
export interface MoltPayToolConfig {
  encryptionKey: string;
  rpcEndpoint?: string;
  network?: 'devnet' | 'mainnet-beta';
}

/**
 * JSON Schema definitions for LangChain tools
 */
export const MOLTPAY_TOOL_SCHEMAS = {
  create_wallet: {
    name: 'moltpay_create_wallet',
    description: 'Create a new Solana wallet with encrypted private key storage',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  get_balance: {
    name: 'moltpay_get_balance',
    description: 'Get SOL and token balance for a Solana wallet',
    parameters: {
      type: 'object',
      properties: {
        publicKey: {
          type: 'string',
          description: 'Wallet public key (base58)',
        },
        tokens: {
          type: 'array',
          items: { type: 'string' },
          description: 'Token symbols or mint addresses to check (e.g., ["USDC", "USDT"])',
        },
      },
      required: ['publicKey'],
    },
  },

  send_payment: {
    name: 'moltpay_send_payment',
    description: 'Send SOL or SPL tokens to a recipient on Solana',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient wallet public key (base58)',
        },
        amount: {
          type: 'number',
          description: 'Amount to send (in token units, e.g., 1.5 SOL)',
        },
        token: {
          type: 'string',
          description: 'Token to send: "SOL", "USDC", "USDT", or mint address',
          default: 'SOL',
        },
        memo: {
          type: 'string',
          description: 'Optional memo to attach to transaction',
        },
      },
      required: ['to', 'amount'],
    },
  },

  verify_payment: {
    name: 'moltpay_verify_payment',
    description: 'Verify a payment transaction on Solana blockchain',
    parameters: {
      type: 'object',
      properties: {
        signature: {
          type: 'string',
          description: 'Transaction signature to verify',
        },
        expectedRecipient: {
          type: 'string',
          description: 'Expected recipient address',
        },
        expectedAmount: {
          type: 'number',
          description: 'Expected payment amount',
        },
        expectedToken: {
          type: 'string',
          description: 'Expected token (SOL, USDC, etc.)',
        },
      },
      required: ['signature'],
    },
  },

  get_transaction_history: {
    name: 'moltpay_get_history',
    description: 'Get transaction history for a Solana wallet',
    parameters: {
      type: 'object',
      properties: {
        publicKey: {
          type: 'string',
          description: 'Wallet public key',
        },
        limit: {
          type: 'number',
          description: 'Maximum transactions to return',
          default: 10,
        },
        direction: {
          type: 'string',
          enum: ['sent', 'received', 'all'],
          description: 'Filter by transaction direction',
          default: 'all',
        },
      },
      required: ['publicKey'],
    },
  },
};

/**
 * MoltPay LangChain Tool
 *
 * Provides Solana payment capabilities compatible with LangChain agents.
 * Can be used with StructuredTool or as standalone tool functions.
 */
export class MoltPayTool {
  private walletManager: WalletManager;
  private connection: Connection;
  private transactionBuilder: TransactionBuilder;
  private transactionSender: TransactionSender;
  private paymentVerifier: PaymentVerifier;
  private transactionHistory: TransactionHistory;
  private rateLimiter: RateLimiter;
  private fraudDetection: FraudDetection;
  private config: MoltPayToolConfig;

  private activeWallet?: WalletInfo & { salt: string };

  constructor(config: MoltPayToolConfig) {
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
   */
  async createWallet(): Promise<{
    publicKey: string;
    createdAt: number;
  }> {
    const wallet = this.walletManager.createWallet();
    this.activeWallet = wallet;

    return {
      publicKey: wallet.publicKey,
      createdAt: wallet.createdAt,
    };
  }

  /**
   * Gets balance for a wallet
   */
  async getBalance(params: {
    publicKey: string;
    tokens?: string[];
  }): Promise<{
    sol: number;
    tokens: Array<{ symbol?: string; mint: string; amount: number }>;
  }> {
    const balance = await this.walletManager.getBalance(
      params.publicKey,
      params.tokens || []
    );

    return {
      sol: balance.sol,
      tokens: balance.tokens.map((t) => ({
        symbol: t.symbol,
        mint: t.mint,
        amount: t.uiAmount,
      })),
    };
  }

  /**
   * Sends SOL or tokens
   */
  async sendPayment(params: {
    to: string;
    amount: number;
    token?: SupportedToken | string;
    memo?: string;
  }): Promise<{
    success: boolean;
    signature?: string;
    status?: string;
    receiptId?: string;
    error?: string;
  }> {
    if (!this.activeWallet) {
      return { success: false, error: 'No active wallet. Create a wallet first.' };
    }

    // Check rate limit
    const rateStatus = this.rateLimiter.check(this.activeWallet.publicKey);
    if (rateStatus.exceeded) {
      return {
        success: false,
        error: `Rate limited. Try again at ${new Date(rateStatus.resetAt).toISOString()}`,
      };
    }

    // Check fraud detection
    const fraudCheck = this.fraudDetection.check(
      this.activeWallet.publicKey,
      params.amount
    );
    if (!fraudCheck.allowed) {
      return {
        success: false,
        error: `Transaction blocked: ${fraudCheck.flags.join(', ')}`,
      };
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

      return {
        success: result.status !== 'failed',
        signature: result.signature,
        status: result.status,
        receiptId: receipt.receiptId,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Verifies a payment
   */
  async verifyPayment(params: {
    signature: string;
    expectedRecipient?: string;
    expectedAmount?: number;
    expectedToken?: string;
  }): Promise<{
    verified: boolean;
    receipt?: {
      receiptId: string;
      from: string;
      to: string;
      amount: number;
      token: string;
      timestamp: number;
    };
    failures?: string[];
  }> {
    const receipt = await this.paymentVerifier.verifyPayment({
      signature: params.signature,
      expectedRecipient: params.expectedRecipient,
      expectedAmount: params.expectedAmount,
      expectedToken: params.expectedToken,
    });

    return {
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
    };
  }

  /**
   * Gets transaction history
   */
  async getTransactionHistory(params: {
    publicKey: string;
    limit?: number;
    direction?: 'sent' | 'received' | 'all';
  }): Promise<{
    transactions: Array<{
      signature: string;
      from: string;
      to: string;
      amount: number;
      token: string;
      timestamp: number;
      status: string;
    }>;
  }> {
    const history = await this.transactionHistory.getHistory(params.publicKey, {
      limit: params.limit || 10,
      direction: params.direction || 'all',
    });

    return {
      transactions: history.map((tx) => ({
        signature: tx.signature,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        token: tx.token,
        timestamp: tx.timestamp,
        status: tx.status,
      })),
    };
  }

  /**
   * Requests an airdrop (devnet only)
   */
  async requestAirdrop(params: {
    publicKey: string;
    amount?: number;
  }): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
  }> {
    if (this.config.network === 'mainnet-beta') {
      return { success: false, error: 'Airdrop not available on mainnet' };
    }

    try {
      const signature = await this.walletManager.requestAirdrop(
        params.publicKey,
        params.amount || 1
      );
      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Airdrop failed',
      };
    }
  }

  /**
   * Sets the active wallet
   */
  setActiveWallet(wallet: WalletInfo & { salt: string }): void {
    this.activeWallet = wallet;
  }

  /**
   * Gets the active wallet info (including encrypted key for persistence)
   */
  getActiveWallet(): (WalletInfo & { salt: string }) | undefined {
    return this.activeWallet;
  }

  /**
   * Gets tool definitions for LangChain
   */
  static getToolDefinitions(): typeof MOLTPAY_TOOL_SCHEMAS {
    return MOLTPAY_TOOL_SCHEMAS;
  }

  /**
   * Creates tool functions compatible with LangChain
   */
  getToolFunctions(): Record<string, (params: unknown) => Promise<unknown>> {
    return {
      moltpay_create_wallet: () => this.createWallet(),
      moltpay_get_balance: (params: unknown) =>
        this.getBalance(params as { publicKey: string; tokens?: string[] }),
      moltpay_send_payment: (params: unknown) =>
        this.sendPayment(params as {
          to: string;
          amount: number;
          token?: string;
          memo?: string;
        }),
      moltpay_verify_payment: (params: unknown) =>
        this.verifyPayment(params as {
          signature: string;
          expectedRecipient?: string;
          expectedAmount?: number;
          expectedToken?: string;
        }),
      moltpay_get_history: (params: unknown) =>
        this.getTransactionHistory(params as {
          publicKey: string;
          limit?: number;
          direction?: 'sent' | 'received' | 'all';
        }),
    };
  }
}

/**
 * Creates a MoltPay tool instance from environment configuration
 */
export function createMoltPayTool(config?: Partial<MoltPayToolConfig>): MoltPayTool {
  const fullConfig: MoltPayToolConfig = {
    encryptionKey: config?.encryptionKey || process.env.MOLTPAY_ENCRYPTION_KEY || '',
    rpcEndpoint: config?.rpcEndpoint || process.env.MOLTPAY_RPC_ENDPOINT,
    network: (config?.network || process.env.MOLTPAY_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta',
  };

  if (!fullConfig.encryptionKey) {
    throw new Error('MOLTPAY_ENCRYPTION_KEY environment variable or encryptionKey config required');
  }

  return new MoltPayTool(fullConfig);
}
