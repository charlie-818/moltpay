import { z } from 'zod';

/**
 * MCP Tool Definitions for MoltPay
 *
 * Exports Zod schemas and tool metadata for all MoltPay MCP tools.
 */

// Tool schemas
export const createWalletSchema = z.object({});

export const getBalanceSchema = z.object({
  publicKey: z.string().describe('Wallet public key (base58 encoded)'),
  tokens: z
    .array(z.string())
    .optional()
    .describe('Token symbols or mint addresses to check (e.g., ["USDC", "USDT"])'),
});

export const sendPaymentSchema = z.object({
  to: z.string().describe('Recipient wallet public key (base58 encoded)'),
  amount: z.number().positive().describe('Amount to send (in token units, e.g., 1.5 SOL)'),
  token: z
    .string()
    .optional()
    .default('SOL')
    .describe('Token to send: "SOL", "USDC", "USDT", or mint address'),
  memo: z.string().optional().describe('Optional memo to attach to transaction'),
});

export const verifyPaymentSchema = z.object({
  signature: z.string().describe('Transaction signature to verify'),
  expectedRecipient: z.string().optional().describe('Expected recipient address'),
  expectedAmount: z.number().optional().describe('Expected payment amount'),
  expectedToken: z.string().optional().describe('Expected token (SOL, USDC, etc.)'),
});

export const getHistorySchema = z.object({
  publicKey: z.string().describe('Wallet public key'),
  limit: z.number().int().min(1).max(100).optional().default(10).describe('Maximum transactions to return'),
  direction: z
    .enum(['sent', 'received', 'all'])
    .optional()
    .default('all')
    .describe('Filter by transaction direction'),
});

export const requestAirdropSchema = z.object({
  publicKey: z.string().describe('Wallet public key to receive airdrop'),
  amount: z.number().positive().optional().default(1).describe('Amount of SOL to airdrop (max 2)'),
});

/**
 * Tool definitions with metadata
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
}

export const MOLTPAY_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'create_wallet',
    description:
      'Create a new Solana wallet with encrypted private key storage. Returns the public key of the newly created wallet.',
    inputSchema: createWalletSchema,
  },
  {
    name: 'get_balance',
    description:
      'Get SOL and token balance for a Solana wallet. Returns the SOL balance and any requested token balances.',
    inputSchema: getBalanceSchema,
  },
  {
    name: 'send_payment',
    description:
      'Send SOL or SPL tokens to a recipient on Solana. Requires an active wallet. Returns transaction signature and receipt.',
    inputSchema: sendPaymentSchema,
  },
  {
    name: 'verify_payment',
    description:
      'Verify a payment transaction on Solana blockchain. Confirms the transaction was successful and optionally validates recipient and amount.',
    inputSchema: verifyPaymentSchema,
  },
  {
    name: 'get_history',
    description:
      'Get transaction history for a Solana wallet. Returns recent transactions with details like sender, recipient, amount, and status.',
    inputSchema: getHistorySchema,
  },
  {
    name: 'request_airdrop',
    description:
      'Request a devnet SOL airdrop for testing. Only available on devnet. Returns the airdrop transaction signature.',
    inputSchema: requestAirdropSchema,
  },
];

/**
 * Convert Zod schema to JSON Schema for MCP
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Handle ZodObject
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType;
      properties[key] = zodTypeToJsonSchema(zodValue);

      // Check if required (not optional)
      if (!(zodValue instanceof z.ZodOptional) && !(zodValue instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: 'object', properties: {} };
}

function zodTypeToJsonSchema(zodType: z.ZodType): Record<string, unknown> {
  // Unwrap default
  if (zodType instanceof z.ZodDefault) {
    const inner = zodTypeToJsonSchema(zodType._def.innerType);
    return { ...inner, default: zodType._def.defaultValue() };
  }

  // Unwrap optional
  if (zodType instanceof z.ZodOptional) {
    return zodTypeToJsonSchema(zodType.unwrap());
  }

  // String
  if (zodType instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    if (zodType.description) result.description = zodType.description;
    return result;
  }

  // Number
  if (zodType instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    if (zodType.description) result.description = zodType.description;
    return result;
  }

  // Array
  if (zodType instanceof z.ZodArray) {
    const result: Record<string, unknown> = {
      type: 'array',
      items: zodTypeToJsonSchema(zodType.element),
    };
    if (zodType.description) result.description = zodType.description;
    return result;
  }

  // Enum
  if (zodType instanceof z.ZodEnum) {
    const result: Record<string, unknown> = {
      type: 'string',
      enum: zodType.options,
    };
    if (zodType.description) result.description = zodType.description;
    return result;
  }

  // Default fallback
  return { type: 'string' };
}
