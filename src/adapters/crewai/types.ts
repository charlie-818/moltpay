/**
 * CrewAI-specific types for MoltPay integration
 */

/**
 * CrewAI tool input schema type
 */
export interface CrewAIToolSchema {
  name: string;
  description: string;
  args_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      default?: unknown;
      enum?: string[];
      items?: { type: string };
    }>;
    required: string[];
  };
}

/**
 * CrewAI tool configuration
 */
export interface CrewAIToolConfig {
  encryptionKey: string;
  rpcEndpoint?: string;
  network?: 'devnet' | 'mainnet-beta';
}

/**
 * CrewAI tool result format
 * JSON output compatible with Python's json.loads()
 */
export interface CrewAIToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create wallet result
 */
export interface CreateWalletResult {
  publicKey: string;
  createdAt: number;
}

/**
 * Get balance result
 */
export interface GetBalanceResult {
  sol: number;
  tokens: Array<{
    symbol?: string;
    mint: string;
    amount: number;
  }>;
}

/**
 * Send payment result
 */
export interface SendPaymentResult {
  success: boolean;
  signature?: string;
  status?: string;
  receiptId?: string;
  error?: string;
}

/**
 * Verify payment result
 */
export interface VerifyPaymentResult {
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
}

/**
 * Transaction history result
 */
export interface TransactionHistoryResult {
  transactions: Array<{
    signature: string;
    from: string;
    to: string;
    amount: number;
    token: string;
    timestamp: number;
    status: string;
  }>;
}

/**
 * Airdrop result
 */
export interface AirdropResult {
  success: boolean;
  signature?: string;
  error?: string;
}
