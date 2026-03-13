import { describe, it, expect, beforeEach } from 'vitest';
import {
  encrypt,
  decrypt,
  decryptToString,
  encryptPrivateKey,
  decryptPrivateKey,
  generateEncryptionKey,
  isValidEncryptionKey,
} from '../src/security/Encryption';
import { RateLimiter } from '../src/security/RateLimiter';
import { FraudDetection } from '../src/security/FraudDetection';

const TEST_PASSWORD = 'test-password-123';

describe('Encryption', () => {
  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt string data', () => {
      const data = 'Hello, World!';
      const encrypted = encrypt(data, TEST_PASSWORD);
      const decrypted = decryptToString(encrypted, TEST_PASSWORD);

      expect(decrypted).toBe(data);
    });

    it('should encrypt and decrypt buffer data', () => {
      const data = Buffer.from([1, 2, 3, 4, 5]);
      const encrypted = encrypt(data, TEST_PASSWORD);
      const decrypted = decrypt(encrypted, TEST_PASSWORD);

      expect(Buffer.compare(decrypted, data)).toBe(0);
    });

    it('should produce different output for same input (random IV)', () => {
      const data = 'test data';
      const encrypted1 = encrypt(data, TEST_PASSWORD);
      const encrypted2 = encrypt(data, TEST_PASSWORD);

      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    });

    it('should throw with short password', () => {
      expect(() => encrypt('data', 'short')).toThrow('at least 8 characters');
    });

    it('should fail decryption with wrong password', () => {
      const encrypted = encrypt('data', TEST_PASSWORD);
      expect(() => decrypt(encrypted, 'wrong-password')).toThrow();
    });
  });

  describe('encryptPrivateKey / decryptPrivateKey', () => {
    it('should encrypt and decrypt private keys', () => {
      const privateKey = new Uint8Array(64).fill(42);
      const encrypted = encryptPrivateKey(privateKey, TEST_PASSWORD);
      const decrypted = decryptPrivateKey(encrypted, TEST_PASSWORD);

      expect(decrypted).toEqual(privateKey);
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate keys of specified length', () => {
      const key32 = generateEncryptionKey(32);
      const key16 = generateEncryptionKey(16);

      expect(key32).toHaveLength(64); // hex encoding doubles length
      expect(key16).toHaveLength(32);
    });

    it('should generate unique keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe('isValidEncryptionKey', () => {
    it('should validate key length', () => {
      expect(isValidEncryptionKey('12345678')).toBe(true);
      expect(isValidEncryptionKey('short')).toBe(false);
      expect(isValidEncryptionKey('')).toBe(false);
    });
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      maxTransactions: 3,
      windowMs: 1000, // 1 second window for testing
    });
  });

  describe('check', () => {
    it('should allow transactions within limit', () => {
      const walletId = 'wallet1';

      expect(limiter.check(walletId).exceeded).toBe(false);
      expect(limiter.check(walletId).remaining).toBe(3);
    });
  });

  describe('consume', () => {
    it('should track consumed transactions', () => {
      const walletId = 'wallet2';

      expect(limiter.consume(walletId)).toBe(true);
      expect(limiter.check(walletId).remaining).toBe(2);

      expect(limiter.consume(walletId)).toBe(true);
      expect(limiter.check(walletId).remaining).toBe(1);

      expect(limiter.consume(walletId)).toBe(true);
      expect(limiter.check(walletId).remaining).toBe(0);

      // Should be rate limited
      expect(limiter.consume(walletId)).toBe(false);
      expect(limiter.check(walletId).exceeded).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset limits for a wallet', () => {
      const walletId = 'wallet3';

      limiter.consume(walletId);
      limiter.consume(walletId);
      expect(limiter.check(walletId).remaining).toBe(1);

      limiter.reset(walletId);
      expect(limiter.check(walletId).remaining).toBe(3);
    });
  });

  describe('resetAll', () => {
    it('should reset all limits', () => {
      limiter.consume('wallet1');
      limiter.consume('wallet2');

      limiter.resetAll();

      expect(limiter.check('wallet1').remaining).toBe(3);
      expect(limiter.check('wallet2').remaining).toBe(3);
    });
  });
});

describe('FraudDetection', () => {
  let detector: FraudDetection;

  beforeEach(() => {
    detector = new FraudDetection({
      maxTransactionAmount: 10,
      maxDailyVolume: 50,
      minTransactionInterval: 100,
      anomalyDetection: true,
    });
  });

  describe('check', () => {
    it('should allow normal transactions', () => {
      const result = detector.check('wallet1', 5);

      expect(result.allowed).toBe(true);
      expect(result.riskScore).toBe(0);
      expect(result.flags).toHaveLength(0);
    });

    it('should flag transactions exceeding max amount', () => {
      const result = detector.check('wallet1', 15);

      expect(result.allowed).toBe(false);
      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.flags.some(f => f.includes('exceeds limit'))).toBe(true);
    });

    it('should flag transactions exceeding daily volume', () => {
      const walletId = 'wallet2';

      // Record transactions to build up volume
      detector.record(walletId, 20, 'sig1');
      detector.record(walletId, 20, 'sig2');

      // This should exceed daily volume
      const result = detector.check(walletId, 15);

      expect(result.flags.some(f => f.includes('Daily volume'))).toBe(true);
    });

    it('should detect duplicate transactions', () => {
      const walletId = 'wallet3';
      const signature = 'duplicate-sig';

      detector.record(walletId, 5, signature);
      const result = detector.check(walletId, 5, signature);

      expect(result.allowed).toBe(false);
      expect(result.flags.some(f => f.includes('Duplicate'))).toBe(true);
    });
  });

  describe('record', () => {
    it('should record transactions', () => {
      const walletId = 'wallet4';

      detector.record(walletId, 5, 'sig1');
      detector.record(walletId, 3, 'sig2');

      const history = detector.getHistory(walletId);
      expect(history).toHaveLength(2);
    });
  });

  describe('isDuplicate', () => {
    it('should detect processed signatures', () => {
      detector.record('wallet', 5, 'unique-sig');

      expect(detector.isDuplicate('unique-sig')).toBe(true);
      expect(detector.isDuplicate('new-sig')).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset wallet history', () => {
      const walletId = 'wallet5';

      detector.record(walletId, 5, 'sig');
      expect(detector.getHistory(walletId)).toHaveLength(1);

      detector.reset(walletId);
      expect(detector.getHistory(walletId)).toHaveLength(0);
    });
  });
});
