import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, SystemProgram } from '@solana/web3.js';
import { PaymentVerifier } from '../src/receipt/PaymentVerifier';
import { ReceiptGenerator } from '../src/receipt/ReceiptGenerator';
import { TransactionHistory } from '../src/receipt/TransactionHistory';
import type { TransactionResult, PaymentReceipt } from '../src/types';

// Generate valid keypairs for testing
const senderKeypair = Keypair.generate();
const recipientKeypair = Keypair.generate();

// Mock parsed transaction
const mockParsedTransaction = {
  blockTime: Math.floor(Date.now() / 1000),
  slot: 12345,
  meta: {
    err: null,
    fee: 5000,
    preBalances: [10 * LAMPORTS_PER_SOL, 0],
    postBalances: [8.5 * LAMPORTS_PER_SOL, 1.5 * LAMPORTS_PER_SOL],
  },
  transaction: {
    message: {
      instructions: [
        {
          parsed: {
            type: 'transfer',
            info: {
              source: senderKeypair.publicKey.toBase58(),
              destination: recipientKeypair.publicKey.toBase58(),
              lamports: 1.5 * LAMPORTS_PER_SOL,
            },
          },
        },
      ],
      accountKeys: [
        { pubkey: SystemProgram.programId },
        { pubkey: recipientKeypair.publicKey },
      ],
    },
  },
};

const mockConnection = {
  getParsedTransaction: vi.fn().mockResolvedValue(mockParsedTransaction),
  getTransaction: vi.fn().mockResolvedValue({
    ...mockParsedTransaction,
    meta: { ...mockParsedTransaction.meta },
  }),
  getSignaturesForAddress: vi.fn().mockResolvedValue([
    { signature: 'sig1' },
    { signature: 'sig2' },
  ]),
} as unknown as Connection;

describe('PaymentVerifier', () => {
  let verifier: PaymentVerifier;

  beforeEach(() => {
    verifier = new PaymentVerifier(mockConnection, true);
  });

  describe('verifyPayment', () => {
    it('should verify a valid payment', async () => {
      const receipt = await verifier.verifyPayment({
        signature: 'valid-signature',
      });

      expect(receipt.verified).toBe(true);
      expect(receipt.signature).toBe('valid-signature');
      expect(receipt.receiptId).toMatch(/^RCP-/);
    });

    it('should fail for non-existent transaction', async () => {
      vi.mocked(mockConnection.getParsedTransaction).mockResolvedValueOnce(null);

      const receipt = await verifier.verifyPayment({
        signature: 'non-existent',
      });

      expect(receipt.verified).toBe(false);
      expect(receipt.failures).toContain('Transaction not found');
    });

    it('should verify recipient matches', async () => {
      const receipt = await verifier.verifyPayment({
        signature: 'sig',
        expectedRecipient: 'wrong-recipient',
      });

      expect(receipt.verified).toBe(false);
      expect(receipt.failures?.some(f => f.includes('Recipient mismatch'))).toBe(true);
    });
  });

  describe('transactionExists', () => {
    it('should return true for existing transactions', async () => {
      const exists = await verifier.transactionExists('valid-sig');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent transactions', async () => {
      vi.mocked(mockConnection.getTransaction).mockResolvedValueOnce(null);

      const exists = await verifier.transactionExists('invalid-sig');
      expect(exists).toBe(false);
    });
  });
});

describe('ReceiptGenerator', () => {
  describe('fromTransactionResult', () => {
    it('should create a receipt from transaction result', () => {
      const result: TransactionResult = {
        signature: 'test-signature',
        status: 'confirmed',
        timestamp: Math.floor(Date.now() / 1000),
        slot: 12345,
        fee: 5000,
      };

      const receipt = ReceiptGenerator.fromTransactionResult(
        result,
        'sender',
        'recipient',
        1.5,
        'SOL'
      );

      expect(receipt.verified).toBe(true);
      expect(receipt.signature).toBe('test-signature');
      expect(receipt.from).toBe('sender');
      expect(receipt.to).toBe('recipient');
      expect(receipt.amount).toBe(1.5);
      expect(receipt.token).toBe('SOL');
    });

    it('should mark failed transactions as not verified', () => {
      const result: TransactionResult = {
        signature: 'failed-sig',
        status: 'failed',
        error: 'Transaction failed',
      };

      const receipt = ReceiptGenerator.fromTransactionResult(
        result,
        'sender',
        'recipient',
        1.5,
        'SOL'
      );

      expect(receipt.verified).toBe(false);
      expect(receipt.failures).toContain('Transaction failed');
    });
  });

  describe('generateReceiptId', () => {
    it('should generate consistent IDs', () => {
      const id1 = ReceiptGenerator.generateReceiptId('sig', 1000);
      const id2 = ReceiptGenerator.generateReceiptId('sig', 1000);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^RCP-[A-F0-9]+$/);
    });

    it('should generate different IDs for different inputs', () => {
      const id1 = ReceiptGenerator.generateReceiptId('sig1', 1000);
      const id2 = ReceiptGenerator.generateReceiptId('sig2', 1000);

      expect(id1).not.toBe(id2);
    });
  });

  describe('formatReceipt', () => {
    it('should format receipt as string', () => {
      const receipt: PaymentReceipt = {
        verified: true,
        signature: 'test-signature-12345678901234567890123456789012345678901234567890',
        from: 'sender-address-123456789012345678901234567890123456789012345678',
        to: 'recipient-address-123456789012345678901234567890123456789012345',
        amount: 1.5,
        token: 'SOL',
        timestamp: Math.floor(Date.now() / 1000),
        slot: 12345,
        receiptId: 'RCP-12345678',
      };

      const formatted = ReceiptGenerator.formatReceipt(receipt);

      expect(formatted).toContain('PAYMENT RECEIPT');
      expect(formatted).toContain('RCP-12345678');
      expect(formatted).toContain('VERIFIED');
    });
  });

  describe('toJSON', () => {
    it('should serialize receipt to JSON', () => {
      const receipt: PaymentReceipt = {
        verified: true,
        signature: 'sig',
        from: 'sender',
        to: 'recipient',
        amount: 1.5,
        token: 'SOL',
        timestamp: 1000,
        slot: 100,
        receiptId: 'RCP-TEST',
      };

      const json = ReceiptGenerator.toJSON(receipt);
      const parsed = JSON.parse(json);

      expect(parsed.receiptId).toBe('RCP-TEST');
      expect(parsed.amount).toBe(1.5);
    });
  });

  describe('isValidReceipt', () => {
    it('should validate correct receipts', () => {
      const receipt: PaymentReceipt = {
        verified: true,
        signature: 'sig',
        from: 'sender',
        to: 'recipient',
        amount: 1.5,
        token: 'SOL',
        timestamp: 1000,
        slot: 100,
        receiptId: 'RCP-TEST',
      };

      expect(ReceiptGenerator.isValidReceipt(receipt)).toBe(true);
    });

    it('should reject invalid receipts', () => {
      expect(ReceiptGenerator.isValidReceipt(null)).toBe(false);
      expect(ReceiptGenerator.isValidReceipt({})).toBe(false);
      expect(ReceiptGenerator.isValidReceipt({ verified: true })).toBe(false);
    });
  });

  describe('createProofOfPayment', () => {
    it('should create a shareable proof', () => {
      const receipt: PaymentReceipt = {
        verified: true,
        signature: 'sig',
        from: 'sender',
        to: 'recipient',
        amount: 1.5,
        token: 'SOL',
        timestamp: 1000,
        slot: 100,
        receiptId: 'RCP-TEST',
      };

      const proof = ReceiptGenerator.createProofOfPayment(receipt);

      expect(proof.receiptId).toBe('RCP-TEST');
      expect(proof.recipient).toBe('recipient');
      expect(proof.verified).toBe(true);
      // Should not include 'from' (sender privacy)
      expect('from' in proof).toBe(false);
    });
  });
});

describe('TransactionHistory', () => {
  let history: TransactionHistory;

  beforeEach(() => {
    history = new TransactionHistory(mockConnection);
  });

  describe('getHistory', () => {
    it('should fetch transaction history', async () => {
      const txs = await history.getHistory(senderKeypair.publicKey, { limit: 10 });

      expect(Array.isArray(txs)).toBe(true);
    });
  });

  describe('countTransactions', () => {
    it('should count transactions', async () => {
      const count = await history.countTransactions(senderKeypair.publicKey);

      expect(count).toBe(2); // From mock
    });
  });
});
