import type { CrewAIToolSchema } from './types.js';

/**
 * CrewAI tool schemas for MoltPay
 * These schemas define the input parameters for each tool
 * in a format compatible with CrewAI's Tool class
 */

export const CREATE_WALLET_SCHEMA: CrewAIToolSchema = {
  name: 'moltpay_create_wallet',
  description: 'Create a new Solana wallet with encrypted private key storage. Returns the public key of the new wallet.',
  args_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const GET_BALANCE_SCHEMA: CrewAIToolSchema = {
  name: 'moltpay_get_balance',
  description: 'Get SOL and token balance for a Solana wallet address.',
  args_schema: {
    type: 'object',
    properties: {
      publicKey: {
        type: 'string',
        description: 'Wallet public key (base58 encoded)',
      },
      tokens: {
        type: 'array',
        description: 'Optional token symbols or mint addresses to check (e.g., ["USDC", "USDT"])',
        items: { type: 'string' },
      },
    },
    required: ['publicKey'],
  },
};

export const SEND_PAYMENT_SCHEMA: CrewAIToolSchema = {
  name: 'moltpay_send_payment',
  description: 'Send SOL or SPL tokens to a recipient on Solana blockchain. Requires an active wallet.',
  args_schema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient wallet public key (base58 encoded)',
      },
      amount: {
        type: 'number',
        description: 'Amount to send (in token units, e.g., 1.5 for 1.5 SOL)',
      },
      token: {
        type: 'string',
        description: 'Token to send: "SOL", "USDC", "USDT", or a mint address',
        default: 'SOL',
      },
      memo: {
        type: 'string',
        description: 'Optional memo to attach to the transaction',
      },
    },
    required: ['to', 'amount'],
  },
};

export const VERIFY_PAYMENT_SCHEMA: CrewAIToolSchema = {
  name: 'moltpay_verify_payment',
  description: 'Verify a payment transaction on Solana blockchain. Checks if transaction exists and optionally validates recipient, amount, and token.',
  args_schema: {
    type: 'object',
    properties: {
      signature: {
        type: 'string',
        description: 'Transaction signature to verify',
      },
      expectedRecipient: {
        type: 'string',
        description: 'Expected recipient address for validation',
      },
      expectedAmount: {
        type: 'number',
        description: 'Expected payment amount for validation',
      },
      expectedToken: {
        type: 'string',
        description: 'Expected token (SOL, USDC, etc.) for validation',
      },
    },
    required: ['signature'],
  },
};

export const GET_HISTORY_SCHEMA: CrewAIToolSchema = {
  name: 'moltpay_get_history',
  description: 'Get transaction history for a Solana wallet address.',
  args_schema: {
    type: 'object',
    properties: {
      publicKey: {
        type: 'string',
        description: 'Wallet public key to get history for',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return',
        default: 10,
      },
      direction: {
        type: 'string',
        description: 'Filter by transaction direction',
        enum: ['sent', 'received', 'all'],
        default: 'all',
      },
    },
    required: ['publicKey'],
  },
};

export const REQUEST_AIRDROP_SCHEMA: CrewAIToolSchema = {
  name: 'moltpay_request_airdrop',
  description: 'Request SOL airdrop for testing on Solana devnet. Only works on devnet, not mainnet.',
  args_schema: {
    type: 'object',
    properties: {
      publicKey: {
        type: 'string',
        description: 'Wallet public key to receive the airdrop',
      },
      amount: {
        type: 'number',
        description: 'Amount of SOL to airdrop (default: 1)',
        default: 1,
      },
    },
    required: ['publicKey'],
  },
};

/**
 * All MoltPay tool schemas
 */
export const CREWAI_TOOL_SCHEMAS = {
  create_wallet: CREATE_WALLET_SCHEMA,
  get_balance: GET_BALANCE_SCHEMA,
  send_payment: SEND_PAYMENT_SCHEMA,
  verify_payment: VERIFY_PAYMENT_SCHEMA,
  get_history: GET_HISTORY_SCHEMA,
  request_airdrop: REQUEST_AIRDROP_SCHEMA,
};
