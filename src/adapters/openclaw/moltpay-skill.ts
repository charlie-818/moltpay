import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import type {
  AgentPaymentRequest,
  AgentPaymentResponse,
  WalletInfo,
  SupportedToken,
} from '../../types.js';
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
 * OpenClaw skill configuration from SKILL.md settings
 */
export interface MoltPaySkillConfig {
  encryption_key: string;
  rpc_endpoint?: string;
  network?: 'devnet' | 'mainnet-beta';
}

/**
 * MoltPay OpenClaw Skill
 *
 * Provides Solana payment capabilities to OpenClaw agents.
 * Follows the AgentSkills standard for skill integration.
 */
export class MoltPaySkill {
  private walletManager: WalletManager;
  private connection: Connection;
  private transactionBuilder: TransactionBuilder;
  private transactionSender: TransactionSender;
  private paymentVerifier: PaymentVerifier;
  private transactionHistory: TransactionHistory;
  private rateLimiter: RateLimiter;
  private fraudDetection: FraudDetection;
  private config: MoltPaySkillConfig;

  // Store active wallet for the session
  private activeWallet?: WalletInfo & { salt: string };

  constructor(config: MoltPaySkillConfig) {
    this.config = config;

    const rpcEndpoint = config.rpc_endpoint || clusterApiUrl(config.network || 'devnet');
    this.connection = new Connection(rpcEndpoint, 'confirmed');

    this.walletManager = new WalletManager({
      encryptionKey: config.encryption_key,
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
   * Main entry point for skill actions
   */
  async execute(request: AgentPaymentRequest): Promise<AgentPaymentResponse> {
    try {
      switch (request.action) {
        case 'create_wallet':
          return this.createWallet();

        case 'send':
          return this.send(request.params);

        case 'get_balance':
          return this.getBalance(request.params);

        case 'verify_payment':
          return this.verifyPayment(request.params);

        case 'get_history':
          return this.getHistory(request.params);

        default:
          return {
            success: false,
            error: `Unknown action: ${request.action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Creates a new wallet
   */
  private createWallet(): AgentPaymentResponse {
    const wallet = this.walletManager.createWallet();
    this.activeWallet = wallet;

    return {
      success: true,
      data: {
        publicKey: wallet.publicKey,
        createdAt: wallet.createdAt,
      },
    };
  }

  /**
   * Creates an HD wallet with mnemonic
   */
  createHDWallet(params: { accountIndex?: number }): AgentPaymentResponse {
    const { wallet, mnemonic } = this.walletManager.createHDWallet({
      accountIndex: params.accountIndex,
    });

    this.activeWallet = wallet;

    return {
      success: true,
      data: {
        publicKey: wallet.publicKey,
        mnemonic,
        derivationPath: wallet.derivationPath,
      },
    };
  }

  /**
   * Gets balance for a wallet
   */
  private async getBalance(params: Record<string, unknown>): Promise<AgentPaymentResponse> {
    const publicKey = (params.publicKey as string) || this.activeWallet?.publicKey;

    if (!publicKey) {
      return { success: false, error: 'No wallet specified' };
    }

    const tokens = (params.tokens as string[]) || [];
    const balance = await this.walletManager.getBalance(publicKey, tokens);

    return {
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
  }

  /**
   * Sends SOL or tokens
   */
  private async send(params: Record<string, unknown>): Promise<AgentPaymentResponse> {
    const to = params.to as string;
    const amount = params.amount as number;
    const token = (params.token as SupportedToken) || 'SOL';
    const memo = params.memo as string | undefined;

    if (!to || !amount) {
      return { success: false, error: 'Missing required parameters: to, amount' };
    }

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
      amount
    );
    if (!fraudCheck.allowed) {
      return {
        success: false,
        error: `Transaction blocked: ${fraudCheck.flags.join(', ')}`,
      };
    }

    // Decrypt keypair
    const keypair = decryptKeypair(this.activeWallet, this.config.encryption_key);

    // Build transaction
    const built = await this.transactionBuilder.buildTransfer({
      sender: keypair,
      recipient: new PublicKey(to),
      amount,
      token,
      memo,
    });

    // Send and confirm
    const result = await this.transactionSender.signSendAndConfirm(
      built.transaction,
      [keypair]
    );

    // Record for rate limiting and fraud detection
    this.rateLimiter.consume(this.activeWallet.publicKey);
    if (result.status !== 'failed') {
      this.fraudDetection.record(this.activeWallet.publicKey, amount, result.signature);
    }

    // Generate receipt
    const receipt = ReceiptGenerator.fromTransactionResult(
      result,
      this.activeWallet.publicKey,
      to,
      amount,
      token
    );

    return {
      success: result.status !== 'failed',
      data: {
        signature: result.signature,
        status: result.status,
        timestamp: result.timestamp,
        receipt: {
          receiptId: receipt.receiptId,
          amount: receipt.amount,
          token: receipt.token,
        },
      },
      error: result.error,
    };
  }

  /**
   * Verifies a payment
   */
  private async verifyPayment(params: Record<string, unknown>): Promise<AgentPaymentResponse> {
    const signature = params.signature as string;

    if (!signature) {
      return { success: false, error: 'Missing required parameter: signature' };
    }

    const receipt = await this.paymentVerifier.verifyPayment({
      signature,
      expectedRecipient: params.expectedRecipient as string | undefined,
      expectedAmount: params.expectedAmount as number | undefined,
      expectedToken: params.expectedToken as SupportedToken | string | undefined,
    });

    return {
      success: receipt.verified,
      data: {
        verified: receipt.verified,
        receipt: {
          receiptId: receipt.receiptId,
          from: receipt.from,
          to: receipt.to,
          amount: receipt.amount,
          token: receipt.token,
          timestamp: receipt.timestamp,
        },
        failures: receipt.failures,
      },
    };
  }

  /**
   * Gets transaction history
   */
  private async getHistory(params: Record<string, unknown>): Promise<AgentPaymentResponse> {
    const publicKey = (params.publicKey as string) || this.activeWallet?.publicKey;

    if (!publicKey) {
      return { success: false, error: 'No wallet specified' };
    }

    const history = await this.transactionHistory.getHistory(publicKey, {
      limit: (params.limit as number) || 10,
      direction: params.direction as 'sent' | 'received' | 'all' | undefined,
    });

    return {
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
  }

  /**
   * Requests an airdrop (devnet only)
   */
  async requestAirdrop(params: {
    publicKey?: string;
    amount?: number;
  }): Promise<AgentPaymentResponse> {
    const publicKey = params.publicKey || this.activeWallet?.publicKey;

    if (!publicKey) {
      return { success: false, error: 'No wallet specified' };
    }

    if (this.config.network === 'mainnet-beta') {
      return { success: false, error: 'Airdrop not available on mainnet' };
    }

    const amount = params.amount || 1;
    const signature = await this.walletManager.requestAirdrop(publicKey, amount);

    return {
      success: true,
      data: {
        signature,
        amount,
      },
    };
  }

  /**
   * Sets the active wallet for operations
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
}

/**
 * Creates a MoltPay skill instance from environment configuration
 */
export function createMoltPaySkill(config?: Partial<MoltPaySkillConfig>): MoltPaySkill {
  const fullConfig: MoltPaySkillConfig = {
    encryption_key: config?.encryption_key || process.env.MOLTPAY_ENCRYPTION_KEY || '',
    rpc_endpoint: config?.rpc_endpoint || process.env.MOLTPAY_RPC_ENDPOINT,
    network: (config?.network || process.env.MOLTPAY_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta',
  };

  if (!fullConfig.encryption_key) {
    throw new Error('MOLTPAY_ENCRYPTION_KEY environment variable or encryption_key config required');
  }

  return new MoltPaySkill(fullConfig);
}

// Export for OpenClaw skill registry
export default {
  name: 'moltpay',
  version: '1.0.0',
  create: createMoltPaySkill,
};
