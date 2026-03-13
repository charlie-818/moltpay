/**
 * Test fixtures for Solana connection and transaction mocks
 */

import { vi } from 'vitest';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// Mock blockhash and block height
export const MOCK_BLOCKHASH = {
  blockhash: '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM',
  lastValidBlockHeight: 100,
};

// Mock transaction signature
export const MOCK_SIGNATURE = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

// Mock SOL balances
export const MOCK_BALANCES = {
  funded: 10 * LAMPORTS_PER_SOL,    // 10 SOL
  low: 0.001 * LAMPORTS_PER_SOL,     // 0.001 SOL
  zero: 0,
  standard: 1 * LAMPORTS_PER_SOL,    // 1 SOL
};

// Mock token balances (in smallest units, assuming 6 decimals)
export const MOCK_TOKEN_BALANCES = {
  usdc: 1000_000_000, // 1000 USDC
  usdt: 500_000_000,  // 500 USDT
  zero: 0,
};

// Token mint addresses
export const TOKEN_MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC_DEVNET: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

// Mock wallet keypairs (DO NOT USE IN PRODUCTION)
export const MOCK_WALLETS = {
  payer: {
    publicKey: '7fUAJdStEuGbc3sM84cKRL6yYaaSstyLSU1EnJcdPBCD',
    secretKey: new Uint8Array(64).fill(1),
  },
  recipient: {
    publicKey: 'HNtHqvrvCCmKrFFfCH6jJhDsJYEW9tXxUQAGvAp3F4nz',
    secretKey: new Uint8Array(64).fill(2),
  },
  escrow: {
    publicKey: 'AZNZp1GvFt3Q4GxqBvGmCvBNiYNTTGzZmvLQQqzSMCeR',
    secretKey: new Uint8Array(64).fill(3),
  },
};

// Mock transaction details
export const MOCK_TRANSACTION = {
  slot: 12345,
  blockTime: Math.floor(Date.now() / 1000),
  meta: {
    err: null,
    preBalances: [10 * LAMPORTS_PER_SOL, 5 * LAMPORTS_PER_SOL],
    postBalances: [9 * LAMPORTS_PER_SOL, 6 * LAMPORTS_PER_SOL],
    fee: 5000,
  },
  transaction: {
    message: {
      getAccountKeys: () => ({
        staticAccountKeys: [
          { toBase58: () => MOCK_WALLETS.payer.publicKey },
          { toBase58: () => MOCK_WALLETS.recipient.publicKey },
        ],
      }),
    },
  },
};

// Mock failed transaction
export const MOCK_FAILED_TRANSACTION = {
  ...MOCK_TRANSACTION,
  meta: {
    ...MOCK_TRANSACTION.meta,
    err: { InsufficientFunds: {} },
  },
};

/**
 * Create a mock Solana connection
 */
export function createMockConnection(options: {
  balance?: number;
  tokenBalance?: number;
  transactionSuccess?: boolean;
} = {}) {
  const {
    balance = MOCK_BALANCES.funded,
    tokenBalance = MOCK_TOKEN_BALANCES.usdc,
    transactionSuccess = true,
  } = options;

  return {
    getBalance: vi.fn().mockResolvedValue(balance),
    getLatestBlockhash: vi.fn().mockResolvedValue(MOCK_BLOCKHASH),
    sendTransaction: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
    confirmTransaction: vi.fn().mockResolvedValue({
      value: { err: transactionSuccess ? null : { InsufficientFunds: {} } },
    }),
    getTransaction: vi.fn().mockResolvedValue(
      transactionSuccess ? MOCK_TRANSACTION : MOCK_FAILED_TRANSACTION
    ),
    getParsedAccountInfo: vi.fn().mockResolvedValue({
      value: {
        data: {
          parsed: {
            info: {
              decimals: 6,
            },
          },
        },
      },
    }),
    getAccountInfo: vi.fn().mockResolvedValue({
      lamports: balance,
      owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      data: Buffer.alloc(165),
      executable: false,
    }),
    getFeeForMessage: vi.fn().mockResolvedValue({ value: 5000 }),
    getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(2039280),
  };
}

/**
 * Create a mock Keypair
 */
export function createMockKeypair(type: 'payer' | 'recipient' | 'escrow' = 'payer') {
  const wallet = MOCK_WALLETS[type];
  return {
    publicKey: {
      toBase58: () => wallet.publicKey,
      toBuffer: () => Buffer.from(wallet.publicKey),
      equals: (other: { toBase58: () => string }) => other.toBase58() === wallet.publicKey,
    },
    secretKey: wallet.secretKey,
  };
}

/**
 * Create mock token account
 */
export function createMockTokenAccount(balance: bigint = BigInt(MOCK_TOKEN_BALANCES.usdc)) {
  return {
    address: { toBase58: () => 'TokenAccountAddress123' },
    mint: { toBase58: () => TOKEN_MINTS.USDC },
    owner: { toBase58: () => MOCK_WALLETS.payer.publicKey },
    amount: balance,
    delegate: null,
    delegatedAmount: BigInt(0),
    isInitialized: true,
    isFrozen: false,
    isNative: false,
    rentExemptReserve: null,
    closeAuthority: null,
  };
}

/**
 * Mock getAssociatedTokenAddress
 */
export const mockGetAssociatedTokenAddress = vi.fn().mockResolvedValue({
  toBase58: () => 'AssociatedTokenAddress123',
});

/**
 * Mock getAccount
 */
export const mockGetAccount = vi.fn().mockImplementation(() =>
  Promise.resolve(createMockTokenAccount())
);

/**
 * Mock createTransferInstruction
 */
export const mockCreateTransferInstruction = vi.fn().mockReturnValue({
  keys: [],
  programId: { toBase58: () => 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
  data: Buffer.alloc(9),
});

/**
 * Mock sendAndConfirmTransaction
 */
export const mockSendAndConfirmTransaction = vi.fn().mockResolvedValue(MOCK_SIGNATURE);

/**
 * Create a mock PublicKey
 */
export function createMockPublicKey(address: string = MOCK_WALLETS.payer.publicKey) {
  return {
    toBase58: () => address,
    toBuffer: () => Buffer.from(address),
    equals: (other: { toBase58: () => string }) => other.toBase58() === address,
    toString: () => address,
  };
}

/**
 * Create payment verification response
 */
export function createPaymentVerificationResponse(options: {
  verified?: boolean;
  amount?: number;
  error?: string;
} = {}) {
  const { verified = true, amount = 1, error } = options;

  if (!verified) {
    return {
      verified: false,
      error: error || 'Verification failed',
    };
  }

  return {
    verified: true,
    receipt: {
      signature: MOCK_SIGNATURE,
      payer: MOCK_WALLETS.payer.publicKey,
      recipient: MOCK_WALLETS.recipient.publicKey,
      amount,
      currency: 'SOL',
      timestamp: Date.now(),
      slot: 12345,
      skillId: 'test-skill',
    },
  };
}

/**
 * Setup Solana module mocks
 */
export function setupSolanaMocks() {
  vi.mock('@solana/web3.js', async () => {
    const actual = await vi.importActual('@solana/web3.js');
    return {
      ...actual,
      Connection: vi.fn().mockImplementation(() => createMockConnection()),
      sendAndConfirmTransaction: mockSendAndConfirmTransaction,
      PublicKey: vi.fn().mockImplementation((key: string) => createMockPublicKey(key)),
      Keypair: {
        generate: vi.fn().mockReturnValue(createMockKeypair()),
        fromSecretKey: vi.fn().mockReturnValue(createMockKeypair()),
      },
    };
  });

  vi.mock('@solana/spl-token', async () => {
    const actual = await vi.importActual('@solana/spl-token');
    return {
      ...actual,
      getAssociatedTokenAddress: mockGetAssociatedTokenAddress,
      getAccount: mockGetAccount,
      createTransferInstruction: mockCreateTransferInstruction,
    };
  });
}

/**
 * Reset all Solana mocks
 */
export function resetSolanaMocks() {
  mockGetAssociatedTokenAddress.mockClear();
  mockGetAccount.mockClear();
  mockCreateTransferInstruction.mockClear();
  mockSendAndConfirmTransaction.mockClear();
}
