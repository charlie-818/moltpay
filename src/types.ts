import { PublicKey, Keypair, TransactionSignature, Commitment } from '@solana/web3.js';

// ============================================================
// Wallet Types
// ============================================================

export interface WalletConfig {
  /** Encryption key for securing private keys at rest */
  encryptionKey?: string;
  /** RPC endpoint URL (defaults to devnet) */
  rpcEndpoint?: string;
}

export interface WalletInfo {
  /** Base58-encoded public key */
  publicKey: string;
  /** Encrypted private key (base64) */
  encryptedPrivateKey: string;
  /** Initialization vector for decryption (base64) */
  iv: string;
  /** Creation timestamp */
  createdAt: number;
}

export interface HDWalletConfig extends WalletConfig {
  /** BIP39 mnemonic phrase (12 or 24 words) */
  mnemonic?: string;
  /** Derivation path (defaults to m/44'/501'/0'/0') */
  derivationPath?: string;
  /** Account index for derivation */
  accountIndex?: number;
}

export interface HDWalletInfo extends WalletInfo {
  /** Derivation path used */
  derivationPath: string;
  /** Account index */
  accountIndex: number;
}

export interface Balance {
  /** SOL balance in lamports */
  lamports: bigint;
  /** SOL balance as decimal */
  sol: number;
  /** SPL token balances */
  tokens: TokenBalance[];
}

export interface TokenBalance {
  /** Token mint address */
  mint: string;
  /** Token symbol (if known) */
  symbol?: string;
  /** Balance in smallest units */
  amount: bigint;
  /** Decimals for the token */
  decimals: number;
  /** Human-readable balance */
  uiAmount: number;
}

// ============================================================
// Transaction Types
// ============================================================

export type SupportedToken = 'SOL' | 'USDC' | 'USDT';

export interface SendOptions {
  /** Sender wallet info or decrypted keypair */
  from: WalletInfo | Keypair;
  /** Recipient public key (base58 string or PublicKey) */
  to: string | PublicKey;
  /** Amount to send (in token units, e.g., 1.5 SOL) */
  amount: number;
  /** Token to send (SOL, USDC, USDT, or mint address) */
  token?: SupportedToken | string;
  /** Confirmation level to wait for */
  confirmation?: Commitment;
  /** Memo to attach to transaction */
  memo?: string;
  /** Encryption key to decrypt wallet (if using WalletInfo) */
  encryptionKey?: string;
}

export interface TransactionResult {
  /** Transaction signature */
  signature: TransactionSignature;
  /** Transaction status */
  status: 'confirmed' | 'finalized' | 'failed';
  /** Block time (Unix timestamp) */
  timestamp?: number;
  /** Slot number */
  slot?: number;
  /** Fee paid in lamports */
  fee?: number;
  /** Error message if failed */
  error?: string;
}

export interface TransactionDetails {
  /** Transaction signature */
  signature: string;
  /** Sender public key */
  from: string;
  /** Recipient public key */
  to: string;
  /** Amount transferred */
  amount: number;
  /** Token transferred */
  token: string;
  /** Block time */
  timestamp: number;
  /** Slot number */
  slot: number;
  /** Fee paid */
  fee: number;
  /** Transaction status */
  status: 'success' | 'failed';
}

// ============================================================
// Receipt/Verification Types
// ============================================================

export interface VerifyPaymentOptions {
  /** Transaction signature to verify */
  signature: string;
  /** Expected recipient address */
  expectedRecipient?: string;
  /** Expected amount (with tolerance) */
  expectedAmount?: number;
  /** Expected token */
  expectedToken?: SupportedToken | string;
  /** Amount tolerance (percentage, default 0.01 = 1%) */
  tolerance?: number;
}

export interface PaymentReceipt {
  /** Whether the payment is verified */
  verified: boolean;
  /** Transaction signature */
  signature: string;
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Amount transferred */
  amount: number;
  /** Token transferred */
  token: string;
  /** Block time (Unix timestamp) */
  timestamp: number;
  /** Slot number */
  slot: number;
  /** Verification failures (if any) */
  failures?: string[];
  /** Unique receipt ID */
  receiptId: string;
}

export interface TransactionHistoryOptions {
  /** Maximum number of transactions to return */
  limit?: number;
  /** Pagination cursor (signature to start before) */
  before?: string;
  /** Filter by token */
  token?: SupportedToken | string;
  /** Filter by direction */
  direction?: 'sent' | 'received' | 'all';
}

// ============================================================
// Security Types
// ============================================================

export interface RateLimitConfig {
  /** Maximum transactions per window */
  maxTransactions: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitStatus {
  /** Number of transactions remaining */
  remaining: number;
  /** Reset time (Unix timestamp) */
  resetAt: number;
  /** Whether limit is exceeded */
  exceeded: boolean;
}

export interface FraudDetectionConfig {
  /** Maximum single transaction amount (in SOL) */
  maxTransactionAmount: number;
  /** Maximum daily transaction volume (in SOL) */
  maxDailyVolume: number;
  /** Minimum time between transactions (ms) */
  minTransactionInterval: number;
  /** Enable anomaly detection */
  anomalyDetection: boolean;
}

export interface FraudCheckResult {
  /** Whether the transaction is allowed */
  allowed: boolean;
  /** Risk score (0-100) */
  riskScore: number;
  /** Reasons for flagging (if any) */
  flags: string[];
}

// ============================================================
// SDK Configuration
// ============================================================

export interface MoltPayConfig {
  /** Solana RPC endpoint */
  rpcEndpoint?: string;
  /** Default commitment level */
  commitment?: Commitment;
  /** Encryption key for wallet storage */
  encryptionKey?: string;
  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;
  /** Fraud detection configuration */
  fraudDetection?: FraudDetectionConfig;
  /** Whitelisted token mints (in addition to SOL, USDC, USDT) */
  tokenWhitelist?: string[];
}

// ============================================================
// Token Constants
// ============================================================

export const TOKEN_MINTS: Record<SupportedToken, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

export const DEVNET_TOKEN_MINTS: Record<SupportedToken, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Devnet USDC
  USDT: 'EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS', // Devnet USDT
};

// ============================================================
// Adapter Types
// ============================================================

export interface AgentPaymentRequest {
  /** Action to perform */
  action: 'create_wallet' | 'send' | 'get_balance' | 'verify_payment' | 'get_history';
  /** Action parameters */
  params: Record<string, unknown>;
}

export interface AgentPaymentResponse {
  /** Whether the action succeeded */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
}
