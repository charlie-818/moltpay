import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentManager } from '../../../src/payments/PaymentManager';
import {
  createMockConnection,
  createMockKeypair,
  createMockPublicKey,
  MOCK_SIGNATURE,
  MOCK_BALANCES,
  MOCK_TOKEN_BALANCES,
  MOCK_WALLETS,
  TOKEN_MINTS,
} from '../../fixtures/solana-mocks';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// Mock the solana web3.js module
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
  return {
    ...actual,
    sendAndConfirmTransaction: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
  };
});

// Mock spl-token
vi.mock('@solana/spl-token', async () => {
  const actual = await vi.importActual('@solana/spl-token');
  return {
    ...actual,
    getAssociatedTokenAddress: vi.fn().mockResolvedValue({
      toBase58: () => 'AssociatedTokenAddress',
    }),
    getAccount: vi.fn().mockResolvedValue({
      amount: BigInt(MOCK_TOKEN_BALANCES.usdc),
    }),
    createTransferInstruction: vi.fn().mockReturnValue({
      keys: [],
      programId: { toBase58: () => 'TokenProgram' },
      data: Buffer.alloc(9),
    }),
  };
});

describe('PaymentManager', () => {
  let paymentManager: PaymentManager;
  let mockConnection: ReturnType<typeof createMockConnection>;

  beforeEach(() => {
    mockConnection = createMockConnection();
    paymentManager = new PaymentManager({
      connection: mockConnection as any,
      commitment: 'confirmed',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getSOLBalance', () => {
    it('should return SOL balance in SOL units', async () => {
      mockConnection.getBalance.mockResolvedValue(MOCK_BALANCES.standard);

      const balance = await paymentManager.getSOLBalance(createMockPublicKey() as any);

      expect(balance).toBe(1); // 1 SOL
    });

    it('should return 0 for empty wallet', async () => {
      mockConnection.getBalance.mockResolvedValue(MOCK_BALANCES.zero);

      const balance = await paymentManager.getSOLBalance(createMockPublicKey() as any);

      expect(balance).toBe(0);
    });

    it('should handle large balances', async () => {
      mockConnection.getBalance.mockResolvedValue(MOCK_BALANCES.funded);

      const balance = await paymentManager.getSOLBalance(createMockPublicKey() as any);

      expect(balance).toBe(10); // 10 SOL
    });
  });

  describe('getTokenBalance', () => {
    it('should return token balance', async () => {
      const balance = await paymentManager.getTokenBalance(
        createMockPublicKey() as any,
        createMockPublicKey(TOKEN_MINTS.USDC) as any
      );

      expect(balance).toBeGreaterThan(0);
    });

    it('should return 0 for non-existent token account', async () => {
      const { getAccount } = await import('@solana/spl-token');
      (getAccount as any).mockRejectedValueOnce(new Error('Account not found'));

      const balance = await paymentManager.getTokenBalance(
        createMockPublicKey() as any,
        createMockPublicKey(TOKEN_MINTS.USDC) as any
      );

      expect(balance).toBe(0);
    });
  });

  describe('hasSufficientFunds', () => {
    it('should return true when wallet has enough SOL', async () => {
      mockConnection.getBalance.mockResolvedValue(MOCK_BALANCES.standard);

      const hasFunds = await paymentManager.hasSufficientFunds(
        createMockPublicKey() as any,
        0.5,
        'SOL'
      );

      expect(hasFunds).toBe(true);
    });

    it('should return false when wallet lacks SOL', async () => {
      mockConnection.getBalance.mockResolvedValue(MOCK_BALANCES.low);

      const hasFunds = await paymentManager.hasSufficientFunds(
        createMockPublicKey() as any,
        1,
        'SOL'
      );

      expect(hasFunds).toBe(false);
    });

    it('should account for transaction fee', async () => {
      // Balance is exactly 1 SOL, trying to send 1 SOL should fail due to fee
      mockConnection.getBalance.mockResolvedValue(MOCK_BALANCES.standard);

      const hasFunds = await paymentManager.hasSufficientFunds(
        createMockPublicKey() as any,
        1, // Exactly 1 SOL
        'SOL'
      );

      // Should be false because of fee buffer
      expect(hasFunds).toBe(false);
    });

    it('should check token balance for SPL tokens', async () => {
      const hasFunds = await paymentManager.hasSufficientFunds(
        createMockPublicKey() as any,
        100,
        'USDC'
      );

      expect(hasFunds).toBe(true);
    });

    it('should return false for unsupported currency', async () => {
      const hasFunds = await paymentManager.hasSufficientFunds(
        createMockPublicKey() as any,
        1,
        'UNSUPPORTED'
      );

      expect(hasFunds).toBe(false);
    });
  });

  describe('purchaseSkill', () => {
    it('should process SOL payment successfully', async () => {
      const result = await paymentManager.purchaseSkill(
        {
          skillId: 'test-skill',
          amount: 0.1,
          currency: 'SOL',
          pricingModel: 'one-time',
          payerWallet: MOCK_WALLETS.payer.publicKey,
          recipientWallet: MOCK_WALLETS.recipient.publicKey,
        },
        createMockKeypair() as any
      );

      expect(result.success).toBe(true);
      expect(result.transactionSignature).toBeDefined();
      expect(result.license).toBeDefined();
    });

    it('should return license with correct type for one-time purchase', async () => {
      const result = await paymentManager.purchaseSkill(
        {
          skillId: 'test-skill',
          amount: 0.1,
          currency: 'SOL',
          pricingModel: 'one-time',
          payerWallet: MOCK_WALLETS.payer.publicKey,
          recipientWallet: MOCK_WALLETS.recipient.publicKey,
        },
        createMockKeypair() as any
      );

      expect(result.license?.type).toBe('perpetual');
    });

    it('should return license with correct type for subscription', async () => {
      const result = await paymentManager.purchaseSkill(
        {
          skillId: 'test-skill',
          amount: 0.05,
          currency: 'SOL',
          pricingModel: 'subscription',
          payerWallet: MOCK_WALLETS.payer.publicKey,
          recipientWallet: MOCK_WALLETS.recipient.publicKey,
        },
        createMockKeypair() as any
      );

      expect(result.license?.type).toBe('subscription');
      expect(result.license?.expiresAt).toBeDefined();
    });

    it('should return error for unsupported currency', async () => {
      const result = await paymentManager.purchaseSkill(
        {
          skillId: 'test-skill',
          amount: 1,
          currency: 'UNSUPPORTED',
          pricingModel: 'one-time',
          payerWallet: MOCK_WALLETS.payer.publicKey,
          recipientWallet: MOCK_WALLETS.recipient.publicKey,
        },
        createMockKeypair() as any
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported currency');
    });

    it('should handle transaction failure', async () => {
      const { sendAndConfirmTransaction } = await import('@solana/web3.js');
      (sendAndConfirmTransaction as any).mockRejectedValueOnce(new Error('Transaction failed'));

      const result = await paymentManager.purchaseSkill(
        {
          skillId: 'test-skill',
          amount: 0.1,
          currency: 'SOL',
          pricingModel: 'one-time',
          payerWallet: MOCK_WALLETS.payer.publicKey,
          recipientWallet: MOCK_WALLETS.recipient.publicKey,
        },
        createMockKeypair() as any
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('verifyPayment', () => {
    it('should verify valid SOL payment', async () => {
      const result = await paymentManager.verifyPayment(
        MOCK_SIGNATURE,
        MOCK_WALLETS.recipient.publicKey,
        1,
        'SOL'
      );

      expect(result.verified).toBe(true);
      expect(result.receipt).toBeDefined();
    });

    it('should fail for non-existent transaction', async () => {
      mockConnection.getTransaction.mockResolvedValue(null);

      const result = await paymentManager.verifyPayment(
        'invalid-signature',
        MOCK_WALLETS.recipient.publicKey,
        1,
        'SOL'
      );

      expect(result.verified).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail for failed transaction', async () => {
      mockConnection.getTransaction.mockResolvedValue({
        meta: { err: { InsufficientFunds: {} } },
        transaction: { message: { getAccountKeys: () => ({ staticAccountKeys: [] }) } },
      });

      const result = await paymentManager.verifyPayment(
        MOCK_SIGNATURE,
        MOCK_WALLETS.recipient.publicKey,
        1,
        'SOL'
      );

      expect(result.verified).toBe(false);
      expect(result.error).toContain('failed');
    });
  });

  describe('estimateFee', () => {
    it('should estimate transaction fee', async () => {
      const { Transaction } = await import('@solana/web3.js');
      const tx = new Transaction();

      const fee = await paymentManager.estimateFee(tx);

      expect(fee).toBeGreaterThan(0);
      expect(typeof fee).toBe('number');
    });
  });

  describe('calculatePrice', () => {
    it('should return 0 for free model', () => {
      const price = paymentManager.calculatePrice({
        model: 'free',
        currency: 'SOL',
      });

      expect(price).toBe(0);
    });

    it('should return amount for paid models', () => {
      const price = paymentManager.calculatePrice({
        model: 'one-time',
        amount: 0.5,
        currency: 'SOL',
      });

      expect(price).toBe(0.5);
    });

    it('should return 0 when amount is undefined', () => {
      const price = paymentManager.calculatePrice({
        model: 'one-time',
        currency: 'SOL',
      });

      expect(price).toBe(0);
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return list of supported currencies', () => {
      const currencies = paymentManager.getSupportedCurrencies();

      expect(currencies).toContain('SOL');
      expect(currencies).toContain('USDC');
      expect(currencies).toContain('USDT');
    });
  });

  describe('transferSOL', () => {
    it('should transfer SOL successfully', async () => {
      const signature = await paymentManager.transferSOL(
        createMockKeypair() as any,
        createMockPublicKey(MOCK_WALLETS.recipient.publicKey) as any,
        1
      );

      expect(signature).toBe(MOCK_SIGNATURE);
    });
  });

  describe('transferToken', () => {
    it('should transfer SPL token successfully', async () => {
      const signature = await paymentManager.transferToken(
        createMockKeypair() as any,
        createMockPublicKey(MOCK_WALLETS.recipient.publicKey) as any,
        createMockPublicKey(TOKEN_MINTS.USDC) as any,
        100
      );

      expect(signature).toBe(MOCK_SIGNATURE);
    });
  });

  describe('createEscrowTransaction', () => {
    it('should create escrow transaction', async () => {
      const result = await paymentManager.createEscrowTransaction(
        createMockKeypair() as any,
        createMockPublicKey(MOCK_WALLETS.recipient.publicKey) as any,
        createMockPublicKey(MOCK_WALLETS.escrow.publicKey) as any,
        1,
        'SOL'
      );

      expect(result.transaction).toBeDefined();
      expect(result.escrowAccount).toBeDefined();
    });
  });
});
