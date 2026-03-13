import { PublicKey, Commitment, TransactionSignature } from '@solana/web3.js';

// ============================================================================
// Wallet Types
// ============================================================================

export interface WalletConfig {
  encryption?: EncryptionConfig;
  network?: NetworkConfig;
}

export interface EncryptionConfig {
  key: string;
  algorithm?: 'aes-256-cbc' | 'aes-256-gcm';
}

export interface NetworkConfig {
  endpoint: string;
  commitment?: Commitment;
}

export interface MoltWallet {
  publicKey: string;
  encryptedPrivateKey: string;
  createdAt: number;
}

export interface WalletBalance {
  sol: number;
  tokens: TokenBalance[];
}

export interface TokenBalance {
  mint: string;
  symbol?: string;
  balance: number;
  decimals: number;
}

export interface HDWalletConfig extends WalletConfig {
  mnemonic?: string;
  derivationPath?: string;
}

export interface HDWallet extends MoltWallet {
  mnemonic: string;
  derivationPath: string;
  index: number;
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface SendTransactionParams {
  from: MoltWallet;
  to: string;
  amount: number;
  token?: string; // 'SOL' or SPL token mint address
  confirmation?: Commitment;
  memo?: string;
}

export interface TransactionResult {
  signature: TransactionSignature;
  status: TransactionStatus;
  timestamp: number;
  slot?: number;
  fee?: number;
  error?: string;
}

export type TransactionStatus = 
  | 'pending'
  | 'confirmed'
  | 'finalized'
  | 'failed';

export interface TransactionDetails {
  signature: string;
  blockTime: number | null;
  slot: number;
  fee: number;
  status: TransactionStatus;
  from: string;
  to: string;
  amount: number;
  token: string;
  memo?: string;
}

export interface FeeEstimate {
  lamports: number;
  sol: number;
}

// ============================================================================
// Receipt & Verification Types
// ============================================================================

export interface VerifyPaymentParams {
  signature: string;
  expectedRecipient: string;
  expectedAmount: number;
  expectedToken?: string; // 'SOL' or SPL token mint address
  tolerance?: number; // Percentage tolerance for amount (default 0)
}

export interface PaymentReceipt {
  verified: boolean;
  signature: string;
  timestamp: number;
  sender: string;
  recipient: string;
  amount: number;
  token: string;
  blockTime: number | null;
  slot: number;
  confirmations: number;
  error?: string;
}

export interface TransactionHistoryParams {
  publicKey: string;
  limit?: number;
  before?: string;
  until?: string;
}

export interface TransactionHistoryEntry {
  signature: string;
  blockTime: number | null;
  slot: number;
  status: TransactionStatus;
  type: 'sent' | 'received';
  counterparty: string;
  amount: number;
  token: string;
}

// ============================================================================
// Security Types
// ============================================================================

export interface RateLimitConfig {
  maxTransactionsPerMinute: number;
  maxTransactionsPerHour: number;
  maxAmountPerTransaction: number;
  maxAmountPerDay: number;
}

export interface RateLimitState {
  transactionsLastMinute: number;
  transactionsLastHour: number;
  amountToday: number;
  lastReset: number;
}

export interface FraudDetectionConfig {
  enabled: boolean;
  maxDeviationMultiplier: number; // Flag if amount > (avg * multiplier)
  minTransactionsForBaseline: number;
}

export interface FraudAlert {
  type: 'high_amount' | 'rapid_transactions' | 'unusual_recipient' | 'duplicate_payment';
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: number;
  transactionDetails?: Partial<TransactionDetails>;
}

// ============================================================================
// Token Whitelist Types
// ============================================================================

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
}

export const WHITELISTED_TOKENS: Record<string, TokenInfo> = {
  SOL: {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
  },
  USDC: {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  USDT: {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
  },
};

// Devnet token addresses
export const DEVNET_TOKENS: Record<string, TokenInfo> = {
  SOL: {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
  },
  USDC: {
    mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    symbol: 'USDC',
    name: 'USD Coin (Devnet)',
    decimals: 6,
  },
};

// ============================================================================
// SDK Configuration Types
// ============================================================================

export interface MoltPayConfig {
  network: 'devnet' | 'mainnet-beta' | 'testnet';
  rpcEndpoint?: string;
  commitment?: Commitment;
  encryptionKey?: string;
  rateLimits?: Partial<RateLimitConfig>;
  fraudDetection?: Partial<FraudDetectionConfig>;
}

export const DEFAULT_CONFIG: MoltPayConfig = {
  network: 'devnet',
  commitment: 'confirmed',
  rateLimits: {
    maxTransactionsPerMinute: 10,
    maxTransactionsPerHour: 100,
    maxAmountPerTransaction: 1000,
    maxAmountPerDay: 10000,
  },
  fraudDetection: {
    enabled: true,
    maxDeviationMultiplier: 3,
    minTransactionsForBaseline: 5,
  },
};

// ============================================================================
// Adapter Types
// ============================================================================

export interface OpenClawSkillInput {
  action: 'create_wallet' | 'send' | 'get_balance' | 'verify_payment' | 'get_history';
  params: Record<string, unknown>;
}

export interface OpenClawSkillOutput {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface LangChainToolInput {
  action: string;
  [key: string]: unknown;
}

// ============================================================================
// Error Types
// ============================================================================

export class MoltPayError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MoltPayError';
  }
}

export class WalletError extends MoltPayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WALLET_ERROR', details);
    this.name = 'WalletError';
  }
}

export class TransactionError extends MoltPayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TRANSACTION_ERROR', details);
    this.name = 'TransactionError';
  }
}

export class VerificationError extends MoltPayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VERIFICATION_ERROR', details);
    this.name = 'VerificationError';
  }
}

export class SecurityError extends MoltPayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SECURITY_ERROR', details);
    this.name = 'SecurityError';
  }
}

export class RateLimitError extends SecurityError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.name = 'RateLimitError';
    this.code = 'RATE_LIMIT_ERROR';
  }
}
