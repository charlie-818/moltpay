import { z } from 'zod';

/**
 * API Configuration
 */
export interface ApiConfig {
  encryptionKey: string;
  rpcEndpoint?: string;
  network?: 'devnet' | 'mainnet-beta';
  port?: number;
  apiKey?: string;
  corsOrigins?: string[];
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

/**
 * Error response
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  timestamp: number;
}

// ============================================================
// Request Schemas
// ============================================================

export const CreateWalletRequestSchema = z.object({}).strict();

export const GetBalanceRequestSchema = z.object({
  tokens: z.array(z.string()).optional(),
});

export const SendPaymentRequestSchema = z.object({
  to: z.string().min(32, 'Invalid recipient address'),
  amount: z.number().positive('Amount must be positive'),
  token: z.string().optional().default('SOL'),
  memo: z.string().max(256, 'Memo too long').optional(),
});

export const VerifyPaymentRequestSchema = z.object({
  signature: z.string().min(64, 'Invalid transaction signature'),
  expectedRecipient: z.string().optional(),
  expectedAmount: z.number().positive().optional(),
  expectedToken: z.string().optional(),
});

export const GetHistoryRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
  direction: z.enum(['sent', 'received', 'all']).optional().default('all'),
});

export const RequestAirdropSchema = z.object({
  publicKey: z.string().min(32, 'Invalid wallet address'),
  amount: z.number().positive().max(5).optional().default(1),
});

// ============================================================
// Response Types
// ============================================================

export interface CreateWalletResponse {
  publicKey: string;
  createdAt: number;
}

export interface GetBalanceResponse {
  sol: number;
  tokens: Array<{
    symbol?: string;
    mint: string;
    amount: number;
  }>;
}

export interface SendPaymentResponse {
  signature: string;
  status: string;
  receiptId: string;
}

export interface VerifyPaymentResponse {
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

export interface GetHistoryResponse {
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

export interface RequestAirdropResponse {
  signature: string;
  amount: number;
}

// ============================================================
// Type Inference
// ============================================================

export type CreateWalletRequest = z.infer<typeof CreateWalletRequestSchema>;
export type GetBalanceRequest = z.infer<typeof GetBalanceRequestSchema>;
export type SendPaymentRequest = z.infer<typeof SendPaymentRequestSchema>;
export type VerifyPaymentRequest = z.infer<typeof VerifyPaymentRequestSchema>;
export type GetHistoryRequest = z.infer<typeof GetHistoryRequestSchema>;
export type RequestAirdropRequest = z.infer<typeof RequestAirdropSchema>;
