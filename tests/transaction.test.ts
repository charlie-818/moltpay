import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TransactionBuilder } from '../src/transaction/TransactionBuilder';
import { TransactionSender } from '../src/transaction/TransactionSender';
import { ConfirmationWatcher } from '../src/transaction/ConfirmationWatcher';

// Mock connection for unit tests
const mockConnection = {
  getLatestBlockhash: vi.fn().mockResolvedValue({
    blockhash: 'mock-blockhash',
    lastValidBlockHeight: 1000,
  }),
  getBalance: vi.fn().mockResolvedValue(10 * LAMPORTS_PER_SOL),
  sendRawTransaction: vi.fn().mockResolvedValue('mock-signature'),
  confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
  getTransaction: vi.fn().mockResolvedValue({
    blockTime: Date.now() / 1000,
    slot: 12345,
    meta: { fee: 5000, err: null },
  }),
  getSignatureStatuses: vi.fn().mockResolvedValue({
    value: [{ confirmationStatus: 'confirmed', confirmations: 10, slot: 12345, err: null }],
  }),
  simulateTransaction: vi.fn().mockResolvedValue({
    value: { err: null, logs: ['Program log: Success'], unitsConsumed: 1000 },
  }),
  getFeeForMessage: vi.fn().mockResolvedValue({ value: 5000 }),
} as unknown as Connection;

describe('TransactionBuilder', () => {
  let builder: TransactionBuilder;
  let sender: Keypair;
  let recipient: PublicKey;

  beforeEach(() => {
    builder = new TransactionBuilder(mockConnection, true);
    sender = Keypair.generate();
    recipient = Keypair.generate().publicKey;
  });

  describe('buildSolTransfer', () => {
    it('should build a SOL transfer transaction', async () => {
      const result = await builder.buildSolTransfer(sender, recipient, 1.5);

      expect(result.transaction).toBeTruthy();
      expect(result.createsTokenAccount).toBe(false);
      expect(result.amountRaw).toBe(BigInt(1.5 * LAMPORTS_PER_SOL));
    });

    it('should include memo if provided', async () => {
      const result = await builder.buildSolTransfer(sender, recipient, 1, 'Test memo');

      // Transaction should have instructions (transfer + memo)
      expect(result.transaction.instructions.length).toBeGreaterThan(1);
    });
  });

  describe('buildTransfer', () => {
    it('should build SOL transfer for token="SOL"', async () => {
      const result = await builder.buildTransfer({
        sender,
        recipient,
        amount: 1,
        token: 'SOL',
      });

      expect(result.tokenMint).toBeUndefined();
      expect(result.amountRaw).toBe(BigInt(LAMPORTS_PER_SOL));
    });
  });

  describe('estimateFee', () => {
    it('should estimate transaction fee', async () => {
      const built = await builder.buildSolTransfer(sender, recipient, 1);
      const fee = await builder.estimateFee(built.transaction);

      expect(fee).toBeGreaterThan(0);
    });
  });

  describe('validateBalance', () => {
    it('should validate SOL balance', async () => {
      const result = await builder.validateBalance(sender.publicKey, 5);

      expect(result.sufficient).toBe(true);
      expect(result.available).toBe(10);
    });

    it('should report insufficient balance', async () => {
      const result = await builder.validateBalance(sender.publicKey, 15);

      expect(result.sufficient).toBe(false);
    });
  });
});

describe('TransactionSender', () => {
  let txSender: TransactionSender;
  let builder: TransactionBuilder;
  let sender: Keypair;

  beforeEach(() => {
    txSender = new TransactionSender(mockConnection);
    builder = new TransactionBuilder(mockConnection, true);
    sender = Keypair.generate();
  });

  describe('sign', () => {
    it('should sign a transaction', async () => {
      const recipient = Keypair.generate().publicKey;
      const built = await builder.buildSolTransfer(sender, recipient, 1);

      const signed = txSender.sign(built.transaction, [sender]);

      expect(signed.signatures).toHaveLength(1);
    });

    it('should throw without signers', async () => {
      const recipient = Keypair.generate().publicKey;
      const built = await builder.buildSolTransfer(sender, recipient, 1);

      expect(() => txSender.sign(built.transaction, [])).toThrow('At least one signer');
    });
  });

  describe('signAndSend', () => {
    it('should sign and send a transaction', async () => {
      const recipient = Keypair.generate().publicKey;
      const built = await builder.buildSolTransfer(sender, recipient, 1);

      const signature = await txSender.signAndSend(built.transaction, [sender]);

      expect(signature).toBe('mock-signature');
    });
  });

  describe('confirmTransaction', () => {
    it('should confirm a transaction', async () => {
      const result = await txSender.confirmTransaction('mock-signature');

      expect(result.status).toBe('confirmed');
      expect(result.signature).toBe('mock-signature');
    });
  });

  describe('simulate', () => {
    it('should simulate a transaction', async () => {
      const recipient = Keypair.generate().publicKey;
      const built = await builder.buildSolTransfer(sender, recipient, 1);

      const result = await txSender.simulate(built.transaction, [sender]);

      expect(result.success).toBe(true);
      expect(result.logs).toContain('Program log: Success');
    });
  });
});

describe('ConfirmationWatcher', () => {
  let watcher: ConfirmationWatcher;

  beforeEach(() => {
    watcher = new ConfirmationWatcher(mockConnection);
  });

  afterEach(() => {
    watcher.stopAll();
  });

  describe('getStatus', () => {
    it('should get transaction status', async () => {
      const status = await watcher.getStatus('mock-signature');

      expect(status.status).toBe('confirmed');
      expect(status.confirmations).toBe(10);
    });
  });

  describe('isConfirmed', () => {
    it('should check if transaction is confirmed', async () => {
      const confirmed = await watcher.isConfirmed('mock-signature');

      expect(confirmed).toBe(true);
    });
  });

  describe('watch', () => {
    it('should watch for confirmations', async () => {
      const updates: unknown[] = [];

      const unwatch = watcher.watch('mock-signature', (update) => {
        updates.push(update);
      });

      // Wait for initial poll
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(updates.length).toBeGreaterThan(0);
      unwatch();
    });
  });
});
