import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentManager } from '../../src/payments/PaymentManager';
import { LicenseManager } from '../../src/payments/LicenseManager';
import { SkillManager } from '../../src/skills/SkillManager';
import { AuditLogger } from '../../src/security/AuditLogger';
import { PAID_SKILL_MD } from '../fixtures/skills';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Import fixtures for use in test body (not inside mock factory)
import { createMockConnection, createMockKeypair } from '../fixtures/solana-mocks';

// Mock Solana modules
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
  const fixtures = await import('../fixtures/solana-mocks');
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => fixtures.createMockConnection()),
  };
});

vi.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: vi.fn().mockResolvedValue({
    toBase58: () => 'mock-token-account',
  }),
  getAccount: vi.fn().mockResolvedValue({
    amount: BigInt(1000000000),
  }),
  createTransferInstruction: vi.fn().mockReturnValue({}),
  TOKEN_PROGRAM_ID: { toBase58: () => 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
}));

describe('Payment License Workflow Integration', () => {
  let paymentManager: PaymentManager;
  let licenseManager: LicenseManager;
  let skillManager: SkillManager;
  let auditLogger: AuditLogger;
  let mockConnection: ReturnType<typeof createMockConnection>;

  // Generate test keypairs
  const publisherKeypair = nacl.sign.keyPair();
  const publisherPublicKey = bs58.encode(publisherKeypair.publicKey);
  const publisherPrivateKey = bs58.encode(publisherKeypair.secretKey);

  const buyerKeypair = Keypair.generate();
  const buyerPublicKey = buyerKeypair.publicKey.toBase58();

  beforeEach(() => {
    mockConnection = createMockConnection();

    paymentManager = new PaymentManager({
      connection: mockConnection as unknown as Connection,
      payerKeypair: buyerKeypair,
    });

    licenseManager = new LicenseManager({ inMemory: true });
    auditLogger = new AuditLogger({ inMemory: true });

    skillManager = new SkillManager({
      inMemory: true,
      auditLogger,
    });
  });

  afterEach(() => {
    licenseManager.close();
    auditLogger.close();
  });

  describe('One-Time Purchase Flow', () => {
    it('should complete purchase workflow for perpetual license', async () => {
      // Step 1: Install paid skill metadata
      const skillId = 'paid-skill-1';
      const sellerPublicKey = 'seller-pubkey-123';
      const price = 0.1; // SOL

      // Step 2: Check buyer has sufficient funds
      const balance = await paymentManager.getSolBalance();
      expect(balance).toBeGreaterThanOrEqual(price);

      const hasFunds = await paymentManager.hasSufficientFunds(price, 'SOL');
      expect(hasFunds).toBe(true);

      // Step 3: Log payment initiation
      auditLogger.logPayment(skillId, 'payment_initiated', price, 'SOL');

      // Step 4: Process payment
      const paymentResult = await paymentManager.purchaseSkill({
        skillId,
        price,
        currency: 'SOL',
        sellerPublicKey,
      });

      expect(paymentResult.success).toBe(true);
      expect(paymentResult.signature).toBeDefined();

      // Step 5: Log payment completion
      auditLogger.logPayment(
        skillId,
        'payment_completed',
        price,
        'SOL',
        paymentResult.signature
      );

      // Step 6: Create and sign license
      const license = {
        id: `license-${Date.now()}`,
        skillId,
        purchaserId: buyerPublicKey,
        type: 'perpetual' as const,
        issuedAt: Date.now(),
        receiptSignature: paymentResult.signature!,
      };

      const signature = licenseManager.signLicense(license, publisherPrivateKey);
      license.signature = signature;

      // Step 7: Store license
      licenseManager.storeLicense(license);

      // Step 8: Validate license
      const validation = licenseManager.validateLicense(skillId, buyerPublicKey);
      expect(validation.valid).toBe(true);
      expect(validation.license?.type).toBe('perpetual');

      // Step 9: Verify audit trail
      const paymentLogs = auditLogger.query({
        skillId,
        eventTypes: ['payment_initiated', 'payment_completed'],
      });
      expect(paymentLogs.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle insufficient funds', async () => {
      // Set low balance
      mockConnection.getBalance.mockResolvedValueOnce(10000); // 0.00001 SOL

      const hasFunds = await paymentManager.hasSufficientFunds(1, 'SOL');
      expect(hasFunds).toBe(false);

      // Attempt purchase should fail
      const result = await paymentManager.purchaseSkill({
        skillId: 'expensive-skill',
        price: 1,
        currency: 'SOL',
        sellerPublicKey: 'seller',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient');
    });
  });

  describe('Subscription License Flow', () => {
    it('should create and manage subscription license', async () => {
      const skillId = 'subscription-skill';
      const subscriptionPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
      const price = 0.05; // SOL per month

      // Step 1: Process initial payment
      const paymentResult = await paymentManager.purchaseSkill({
        skillId,
        price,
        currency: 'SOL',
        sellerPublicKey: 'seller',
      });
      expect(paymentResult.success).toBe(true);

      // Step 2: Create subscription license
      const license = {
        id: `sub-${Date.now()}`,
        skillId,
        purchaserId: buyerPublicKey,
        type: 'subscription' as const,
        issuedAt: Date.now(),
        expiresAt: Date.now() + subscriptionPeriod,
        receiptSignature: paymentResult.signature!,
        signature: 'test-sig',
      };

      licenseManager.storeLicense(license);

      // Step 3: Validate active subscription
      let validation = licenseManager.validateLicense(skillId, buyerPublicKey);
      expect(validation.valid).toBe(true);
      expect(validation.expiresIn).toBeDefined();
      expect(validation.expiresIn).toBeLessThanOrEqual(subscriptionPeriod);

      // Step 4: Simulate renewal (extend license)
      const renewalPayment = await paymentManager.purchaseSkill({
        skillId,
        price,
        currency: 'SOL',
        sellerPublicKey: 'seller',
      });
      expect(renewalPayment.success).toBe(true);

      licenseManager.extendLicense(license.id, subscriptionPeriod);

      // Step 5: Verify extended expiry
      const extended = licenseManager.getLicense(license.id);
      expect(extended?.expiresAt).toBeGreaterThan(license.expiresAt!);
    });

    it('should reject expired subscription', async () => {
      const skillId = 'expired-sub-skill';

      // Create expired license
      const license = {
        id: `expired-${Date.now()}`,
        skillId,
        purchaserId: buyerPublicKey,
        type: 'subscription' as const,
        issuedAt: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 days ago
        expiresAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // Expired 30 days ago
        receiptSignature: 'old-sig',
        signature: 'test-sig',
      };

      licenseManager.storeLicense(license);

      // Validation should fail
      const validation = licenseManager.validateLicense(skillId, buyerPublicKey);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('expired');
    });

    it('should track expiring licenses', async () => {
      const sevenDays = 7 * 24 * 60 * 60 * 1000;

      // Create license expiring soon
      licenseManager.storeLicense({
        id: 'expiring-soon',
        skillId: 'skill-1',
        purchaserId: buyerPublicKey,
        type: 'subscription' as const,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days
        receiptSignature: 'sig',
        signature: 'test-sig',
      });

      // Create license expiring later
      licenseManager.storeLicense({
        id: 'not-expiring-soon',
        skillId: 'skill-2',
        purchaserId: buyerPublicKey,
        type: 'subscription' as const,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 days
        receiptSignature: 'sig',
        signature: 'test-sig',
      });

      const expiring = licenseManager.getExpiringLicenses(sevenDays);
      expect(expiring).toHaveLength(1);
      expect(expiring[0].id).toBe('expiring-soon');
    });
  });

  describe('Usage-Based License Flow', () => {
    it('should track and decrement usage', async () => {
      const skillId = 'usage-skill';
      const initialUsage = 100;

      // Step 1: Create usage-based license
      const license = {
        id: `usage-${Date.now()}`,
        skillId,
        purchaserId: buyerPublicKey,
        type: 'usage' as const,
        issuedAt: Date.now(),
        usageRemaining: initialUsage,
        receiptSignature: 'sig',
        signature: 'test-sig',
      };

      licenseManager.storeLicense(license);

      // Step 2: Use some credits
      for (let i = 0; i < 10; i++) {
        licenseManager.recordUsage(license.id);
      }

      // Step 3: Validate remaining usage
      const validation = licenseManager.validateLicense(skillId, buyerPublicKey);
      expect(validation.valid).toBe(true);
      expect(validation.usageRemaining).toBe(90);

      // Step 4: Add more usage
      licenseManager.addUsage(license.id, 50);

      const updated = licenseManager.validateLicense(skillId, buyerPublicKey);
      expect(updated.usageRemaining).toBe(140);
    });

    it('should reject when usage exhausted', async () => {
      const skillId = 'limited-skill';

      // Create license with limited usage
      const license = {
        id: `limited-${Date.now()}`,
        skillId,
        purchaserId: buyerPublicKey,
        type: 'usage' as const,
        issuedAt: Date.now(),
        usageRemaining: 3,
        receiptSignature: 'sig',
        signature: 'test-sig',
      };

      licenseManager.storeLicense(license);

      // Use all credits
      licenseManager.recordUsage(license.id);
      licenseManager.recordUsage(license.id);
      licenseManager.recordUsage(license.id);

      // Validation should fail
      const validation = licenseManager.validateLicense(skillId, buyerPublicKey);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Usage limit');
    });
  });

  describe('License Verification Flow', () => {
    it('should verify signed license', async () => {
      const skillId = 'verified-skill';

      // Create unsigned license
      const license: any = {
        id: `verified-${Date.now()}`,
        skillId,
        purchaserId: buyerPublicKey,
        type: 'perpetual' as const,
        issuedAt: Date.now(),
        receiptSignature: 'payment-sig',
      };

      // Sign license
      const signature = licenseManager.signLicense(license, publisherPrivateKey);
      license.signature = signature;

      // Verify signature
      const isValid = licenseManager.verifySignature(license, publisherPublicKey);
      expect(isValid).toBe(true);
    });

    it('should reject tampered license', async () => {
      const skillId = 'tampered-skill';

      // Create and sign license
      const license: any = {
        id: `tampered-${Date.now()}`,
        skillId,
        purchaserId: buyerPublicKey,
        type: 'perpetual' as const,
        issuedAt: Date.now(),
        receiptSignature: 'payment-sig',
      };

      const signature = licenseManager.signLicense(license, publisherPrivateKey);
      license.signature = signature;

      // Tamper with license
      license.purchaserId = 'different-buyer';

      // Verification should fail
      const isValid = licenseManager.verifySignature(license, publisherPublicKey);
      expect(isValid).toBe(false);
    });
  });

  describe('License Revocation Flow', () => {
    it('should revoke license', async () => {
      const skillId = 'revoked-skill';

      // Create license
      const license = {
        id: `revoked-${Date.now()}`,
        skillId,
        purchaserId: buyerPublicKey,
        type: 'perpetual' as const,
        issuedAt: Date.now(),
        receiptSignature: 'sig',
        signature: 'test-sig',
      };

      licenseManager.storeLicense(license);

      // Validate before revocation
      let validation = licenseManager.validateLicense(skillId, buyerPublicKey);
      expect(validation.valid).toBe(true);

      // Revoke license
      licenseManager.revokeLicense(license.id, 'Terms violation');

      // Validate after revocation
      validation = licenseManager.validateLicense(skillId, buyerPublicKey);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Payment Audit Trail', () => {
    it('should log complete payment flow', async () => {
      const skillId = 'audited-skill';
      const price = 0.1;

      // Log initiation
      auditLogger.logPayment(skillId, 'payment_initiated', price, 'SOL');

      // Process payment
      const result = await paymentManager.purchaseSkill({
        skillId,
        price,
        currency: 'SOL',
        sellerPublicKey: 'seller',
      });

      // Log completion
      auditLogger.logPayment(
        skillId,
        'payment_completed',
        price,
        'SOL',
        result.signature
      );

      // Verify audit trail
      const logs = auditLogger.query({ skillId });
      const initiatedLog = logs.find(l => l.eventType === 'payment_initiated');
      const completedLog = logs.find(l => l.eventType === 'payment_completed');

      expect(initiatedLog).toBeDefined();
      expect(initiatedLog?.details.amount).toBe(price);
      expect(completedLog).toBeDefined();
      expect(completedLog?.details.transactionSignature).toBe(result.signature);
    });

    it('should log payment failure', async () => {
      const skillId = 'failed-payment-skill';

      // Force failure by setting low balance
      mockConnection.getBalance.mockResolvedValueOnce(0);

      const result = await paymentManager.purchaseSkill({
        skillId,
        price: 1,
        currency: 'SOL',
        sellerPublicKey: 'seller',
      });

      expect(result.success).toBe(false);

      // Log failure
      auditLogger.logPayment(
        skillId,
        'payment_failed',
        1,
        'SOL',
        undefined,
        result.error
      );

      const logs = auditLogger.query({
        skillId,
        eventTypes: ['payment_failed'],
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].outcome).toBe('failure');
    });
  });

  describe('Full Payment-License Workflow', () => {
    it('should complete end-to-end purchase and license workflow', async () => {
      const skillId = 'full-workflow-skill';
      const sellerPublicKey = 'seller-pubkey';
      const price = 0.1;

      // 1. Check balance
      const balance = await paymentManager.getSolBalance();
      expect(balance).toBeGreaterThan(0);

      // 2. Check sufficient funds
      const hasFunds = await paymentManager.hasSufficientFunds(price, 'SOL');
      expect(hasFunds).toBe(true);

      // 3. Log payment initiation
      auditLogger.logPayment(skillId, 'payment_initiated', price, 'SOL');

      // 4. Process payment
      const paymentResult = await paymentManager.purchaseSkill({
        skillId,
        price,
        currency: 'SOL',
        sellerPublicKey,
      });
      expect(paymentResult.success).toBe(true);

      // 5. Log payment completion
      auditLogger.logPayment(
        skillId,
        'payment_completed',
        price,
        'SOL',
        paymentResult.signature
      );

      // 6. Create license
      const license: any = {
        id: `license-${Date.now()}`,
        skillId,
        purchaserId: buyerPublicKey,
        type: 'perpetual' as const,
        issuedAt: Date.now(),
        receiptSignature: paymentResult.signature!,
      };

      // 7. Sign license
      const signature = licenseManager.signLicense(license, publisherPrivateKey);
      license.signature = signature;

      // 8. Verify signature
      const isValidSig = licenseManager.verifySignature(license, publisherPublicKey);
      expect(isValidSig).toBe(true);

      // 9. Store license
      licenseManager.storeLicense(license);

      // 10. Validate license for skill access
      const validation = licenseManager.validateLicense(skillId, buyerPublicKey);
      expect(validation.valid).toBe(true);
      expect(validation.license).toBeDefined();

      // 11. Get license stats
      const stats = licenseManager.getStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byType['perpetual']).toBeGreaterThan(0);

      // 12. Verify complete audit trail
      const auditLogs = auditLogger.query({ skillId });
      expect(auditLogs.length).toBeGreaterThanOrEqual(2);

      // 13. Export audit logs
      const exported = auditLogger.export({ skillId });
      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe('SPL Token Payments', () => {
    it('should process SPL token payment', async () => {
      const skillId = 'spl-token-skill';
      const price = 10; // USDC
      const tokenMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mint

      // Check token balance
      const tokenBalance = await paymentManager.getTokenBalance(tokenMint);
      expect(tokenBalance).toBeGreaterThan(0);

      // Check sufficient funds
      const hasFunds = await paymentManager.hasSufficientFunds(price, tokenMint);
      expect(hasFunds).toBe(true);

      // Note: Full token transfer would require additional mocking
      // This tests the balance checking flow
    });
  });
});
