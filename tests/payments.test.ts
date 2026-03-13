import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PaymentManager } from '../src/payments/PaymentManager';
import { LicenseManager } from '../src/payments/LicenseManager';

// Mock the Solana connection
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getBalance: vi.fn().mockResolvedValue(5 * 1000000000), // 5 SOL in lamports
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 100,
      }),
      getTransaction: vi.fn().mockResolvedValue(null),
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
      getFeeForMessage: vi.fn().mockResolvedValue({ value: 5000 }),
    })),
  };
});

describe('PaymentManager', () => {
  let paymentManager: PaymentManager;
  let mockConnection: Connection;

  beforeEach(() => {
    mockConnection = new Connection('https://api.devnet.solana.com');
    paymentManager = new PaymentManager({
      connection: mockConnection,
      commitment: 'confirmed',
    });
  });

  describe('constructor', () => {
    it('should create a payment manager', () => {
      expect(paymentManager).toBeInstanceOf(PaymentManager);
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return supported currencies', () => {
      const currencies = paymentManager.getSupportedCurrencies();
      expect(currencies).toContain('SOL');
      expect(currencies).toContain('USDC');
      expect(currencies).toContain('USDT');
    });
  });

  describe('calculatePrice', () => {
    it('should return 0 for free pricing', () => {
      const price = paymentManager.calculatePrice({
        model: 'free',
      });
      expect(price).toBe(0);
    });

    it('should return amount for one-time pricing', () => {
      const price = paymentManager.calculatePrice({
        model: 'one-time',
        amount: 5,
        currency: 'SOL',
      });
      expect(price).toBe(5);
    });

    it('should return amount for subscription pricing', () => {
      const price = paymentManager.calculatePrice({
        model: 'subscription',
        amount: 10,
        currency: 'USDC',
        period: 'monthly',
      });
      expect(price).toBe(10);
    });
  });

  describe('getSOLBalance', () => {
    it('should get SOL balance', async () => {
      const wallet = Keypair.generate();
      const balance = await paymentManager.getSOLBalance(wallet.publicKey);
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('hasSufficientFunds', () => {
    it('should check if wallet has sufficient SOL', async () => {
      const wallet = Keypair.generate();
      const hasFunds = await paymentManager.hasSufficientFunds(wallet.publicKey, 1, 'SOL');
      expect(typeof hasFunds).toBe('boolean');
    });
  });

  describe('verifyPayment', () => {
    it('should return not found for non-existent transaction', async () => {
      const result = await paymentManager.verifyPayment(
        'fake-signature',
        'fake-recipient',
        1,
        'SOL'
      );

      expect(result.verified).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});

describe('LicenseManager', () => {
  let licenseManager: LicenseManager;

  // Helper to create a license object
  const createLicenseObject = (overrides: Partial<{
    id: string;
    skillId: string;
    purchaserId: string;
    type: 'perpetual' | 'subscription' | 'usage-based';
    expiresAt?: number;
    usageRemaining?: number;
    signature: string;
    receiptSignature: string;
    issuedAt: number;
  }> = {}) => ({
    id: overrides.id || `license-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    skillId: overrides.skillId || 'test-skill',
    purchaserId: overrides.purchaserId || 'buyer-wallet',
    type: overrides.type || 'perpetual',
    issuedAt: overrides.issuedAt || Date.now(),
    expiresAt: overrides.expiresAt,
    usageRemaining: overrides.usageRemaining,
    signature: overrides.signature || 'test-signature',
    receiptSignature: overrides.receiptSignature || 'tx-signature',
  });

  beforeEach(() => {
    licenseManager = new LicenseManager({ inMemory: true });
  });

  describe('constructor', () => {
    it('should create a license manager', () => {
      expect(licenseManager).toBeInstanceOf(LicenseManager);
    });
  });

  describe('storeLicense', () => {
    it('should store a perpetual license', () => {
      const license = createLicenseObject({ type: 'perpetual' });
      licenseManager.storeLicense(license);

      const retrieved = licenseManager.getLicense(license.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.skillId).toBe(license.skillId);
      expect(retrieved?.purchaserId).toBe(license.purchaserId);
      expect(retrieved?.type).toBe('perpetual');
    });

    it('should store a subscription license with expiry', () => {
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      const license = createLicenseObject({ type: 'subscription', expiresAt });
      licenseManager.storeLicense(license);

      const retrieved = licenseManager.getLicense(license.id);
      expect(retrieved?.expiresAt).toBeDefined();
      expect(retrieved?.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('getLicense', () => {
    it('should return null for non-existent license', () => {
      const license = licenseManager.getLicense('nonexistent');
      expect(license).toBeNull();
    });

    it('should retrieve a stored license', () => {
      const license = createLicenseObject();
      licenseManager.storeLicense(license);

      const retrieved = licenseManager.getLicense(license.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(license.id);
    });
  });

  describe('getLicensesBySkill', () => {
    it('should return empty array for skill with no licenses', () => {
      const licenses = licenseManager.getLicensesBySkill('nonexistent-skill');
      expect(licenses).toEqual([]);
    });

    it('should return licenses for a skill', () => {
      licenseManager.storeLicense(createLicenseObject({
        id: 'license-1',
        skillId: 'test-skill',
        purchaserId: 'buyer-1',
      }));

      licenseManager.storeLicense(createLicenseObject({
        id: 'license-2',
        skillId: 'test-skill',
        purchaserId: 'buyer-2',
      }));

      const licenses = licenseManager.getLicensesBySkill('test-skill');
      expect(licenses).toHaveLength(2);
    });
  });

  describe('getLicensesByPurchaser', () => {
    it('should return empty array for purchaser with no licenses', () => {
      const licenses = licenseManager.getLicensesByPurchaser('nonexistent-purchaser');
      expect(licenses).toEqual([]);
    });

    it('should return licenses for a purchaser', () => {
      licenseManager.storeLicense(createLicenseObject({
        id: 'license-1',
        skillId: 'skill-1',
        purchaserId: 'buyer-wallet',
      }));

      licenseManager.storeLicense(createLicenseObject({
        id: 'license-2',
        skillId: 'skill-2',
        purchaserId: 'buyer-wallet',
      }));

      const licenses = licenseManager.getLicensesByPurchaser('buyer-wallet');
      expect(licenses).toHaveLength(2);
    });
  });

  describe('validateLicense', () => {
    it('should return valid for perpetual license', () => {
      const license = createLicenseObject({ type: 'perpetual' });
      licenseManager.storeLicense(license);

      const result = licenseManager.validateLicense(license.skillId, license.purchaserId);
      expect(result.valid).toBe(true);
    });

    it('should return invalid for revoked license', () => {
      const license = createLicenseObject({ type: 'perpetual' });
      licenseManager.storeLicense(license);
      licenseManager.revokeLicense(license.id, 'test revocation');

      // After revocation, getSkillLicense filters out revoked licenses
      // so validateLicense returns "No license found"
      const result = licenseManager.validateLicense(license.skillId, license.purchaserId);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return invalid for expired license', () => {
      const license = createLicenseObject({
        type: 'subscription',
        expiresAt: Date.now() - 1000, // Already expired
      });
      licenseManager.storeLicense(license);

      const result = licenseManager.validateLicense(license.skillId, license.purchaserId);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('revokeLicense', () => {
    it('should revoke a license', () => {
      const license = createLicenseObject();
      licenseManager.storeLicense(license);

      licenseManager.revokeLicense(license.id, 'test revocation');

      const result = licenseManager.validateLicense(license.skillId, license.purchaserId);
      expect(result.valid).toBe(false);
    });

    it('should not throw for non-existent license', () => {
      expect(() => licenseManager.revokeLicense('nonexistent', 'reason')).not.toThrow();
    });
  });

  describe('extendLicense', () => {
    it('should extend license expiry', () => {
      const originalExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const license = createLicenseObject({
        type: 'subscription',
        expiresAt: originalExpiry,
      });
      licenseManager.storeLicense(license);

      const extensionDuration = 30 * 24 * 60 * 60 * 1000; // 30 more days
      licenseManager.extendLicense(license.id, extensionDuration);

      const renewed = licenseManager.getLicense(license.id);
      expect(renewed?.expiresAt).toBeGreaterThan(originalExpiry);
    });
  });

  describe('getExpiringLicenses', () => {
    it('should return licenses expiring within timeframe', () => {
      // License expiring in 1 day
      licenseManager.storeLicense(createLicenseObject({
        id: 'expiring-soon',
        skillId: 'expiring-skill',
        type: 'subscription',
        expiresAt: Date.now() + 1 * 24 * 60 * 60 * 1000,
      }));

      // License expiring in 30 days
      licenseManager.storeLicense(createLicenseObject({
        id: 'expiring-later',
        skillId: 'valid-skill',
        type: 'subscription',
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }));

      // Check licenses expiring in 7 days
      const expiring = licenseManager.getExpiringLicenses(7 * 24 * 60 * 60 * 1000);
      expect(expiring.length).toBeGreaterThanOrEqual(1);
      expect(expiring.some(l => l.skillId === 'expiring-skill')).toBe(true);
    });
  });
});
