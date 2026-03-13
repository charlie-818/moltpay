import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LicenseManager } from '../../../src/payments/LicenseManager';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

describe('LicenseManager', () => {
  let licenseManager: LicenseManager;

  // Generate test keypair
  const testKeypair = nacl.sign.keyPair();
  const testPublicKey = bs58.encode(testKeypair.publicKey);
  const testPrivateKey = bs58.encode(testKeypair.secretKey);

  beforeEach(() => {
    licenseManager = new LicenseManager({ inMemory: true });
  });

  afterEach(() => {
    licenseManager.close();
  });

  describe('storeLicense', () => {
    it('should store a perpetual license', () => {
      const license = createTestLicense('perpetual');

      licenseManager.storeLicense(license);
      const retrieved = licenseManager.getLicense(license.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(license.id);
      expect(retrieved?.type).toBe('perpetual');
    });

    it('should store a subscription license', () => {
      const license = createTestLicense('subscription', {
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });

      licenseManager.storeLicense(license);
      const retrieved = licenseManager.getLicense(license.id);

      expect(retrieved?.type).toBe('subscription');
      expect(retrieved?.expiresAt).toBeDefined();
    });

    it('should store a usage-based license', () => {
      const license = createTestLicense('usage', {
        usageRemaining: 100,
      });

      licenseManager.storeLicense(license);
      const retrieved = licenseManager.getLicense(license.id);

      expect(retrieved?.type).toBe('usage');
      expect(retrieved?.usageRemaining).toBe(100);
    });

    it('should update existing license on re-store', () => {
      const license1 = createTestLicense('perpetual');
      const license2 = { ...license1, skillId: 'updated-skill' };

      licenseManager.storeLicense(license1);
      licenseManager.storeLicense(license2);

      const retrieved = licenseManager.getLicense(license1.id);
      expect(retrieved?.skillId).toBe('updated-skill');
    });
  });

  describe('getLicense', () => {
    it('should return null for non-existent license', () => {
      const result = licenseManager.getLicense('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getSkillLicense', () => {
    it('should get license by skill and purchaser', () => {
      const license = createTestLicense('perpetual');
      licenseManager.storeLicense(license);

      const retrieved = licenseManager.getSkillLicense(
        license.skillId,
        license.purchaserId
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(license.id);
    });

    it('should return most recent license', () => {
      const older = createTestLicense('perpetual');
      older.issuedAt = Date.now() - 10000;

      const newer = createTestLicense('perpetual');
      newer.id = 'newer-license';
      newer.issuedAt = Date.now();

      licenseManager.storeLicense(older);
      licenseManager.storeLicense(newer);

      const retrieved = licenseManager.getSkillLicense(
        newer.skillId,
        newer.purchaserId
      );

      expect(retrieved?.id).toBe('newer-license');
    });

    it('should not return revoked license', () => {
      const license = createTestLicense('perpetual');
      licenseManager.storeLicense(license);
      licenseManager.revokeLicense(license.id, 'Test revocation');

      const retrieved = licenseManager.getSkillLicense(
        license.skillId,
        license.purchaserId
      );

      expect(retrieved).toBeNull();
    });
  });

  describe('getLicensesByPurchaser', () => {
    it('should return all licenses for purchaser', () => {
      const purchaserId = 'purchaser-1';

      licenseManager.storeLicense(createTestLicense('perpetual', { purchaserId }));
      licenseManager.storeLicense({
        ...createTestLicense('subscription'),
        id: 'license-2',
        purchaserId,
      });

      const licenses = licenseManager.getLicensesByPurchaser(purchaserId);
      expect(licenses).toHaveLength(2);
    });

    it('should return empty array for unknown purchaser', () => {
      const licenses = licenseManager.getLicensesByPurchaser('unknown');
      expect(licenses).toEqual([]);
    });
  });

  describe('getLicensesBySkill', () => {
    it('should return all licenses for skill', () => {
      const skillId = 'skill-1';

      licenseManager.storeLicense(createTestLicense('perpetual', { skillId }));
      licenseManager.storeLicense({
        ...createTestLicense('perpetual'),
        id: 'license-2',
        skillId,
        purchaserId: 'other-purchaser',
      });

      const licenses = licenseManager.getLicensesBySkill(skillId);
      expect(licenses).toHaveLength(2);
    });
  });

  describe('validateLicense', () => {
    it('should validate active perpetual license', () => {
      const license = createTestLicense('perpetual');
      licenseManager.storeLicense(license);

      const result = licenseManager.validateLicense(
        license.skillId,
        license.purchaserId
      );

      expect(result.valid).toBe(true);
      expect(result.license).toBeDefined();
    });

    it('should fail for non-existent license', () => {
      const result = licenseManager.validateLicense('unknown', 'unknown');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No license found');
    });

    it('should fail for revoked license', () => {
      const license = createTestLicense('perpetual');
      licenseManager.storeLicense(license);
      licenseManager.revokeLicense(license.id, 'Test');

      const result = licenseManager.validateLicense(
        license.skillId,
        license.purchaserId
      );

      expect(result.valid).toBe(false);
      // After revocation, getSkillLicense filters out revoked licenses
      // so validateLicense returns "No license found"
      expect(result.error).toBeDefined();
    });

    it('should fail for expired subscription', () => {
      const license = createTestLicense('subscription', {
        expiresAt: Date.now() - 1000,
      });
      licenseManager.storeLicense(license);

      const result = licenseManager.validateLicense(
        license.skillId,
        license.purchaserId
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should return expiresIn for valid subscription', () => {
      const expiresIn = 7 * 24 * 60 * 60 * 1000;
      const license = createTestLicense('subscription', {
        expiresAt: Date.now() + expiresIn,
      });
      licenseManager.storeLicense(license);

      const result = licenseManager.validateLicense(
        license.skillId,
        license.purchaserId
      );

      expect(result.valid).toBe(true);
      expect(result.expiresIn).toBeDefined();
      expect(result.expiresIn).toBeLessThanOrEqual(expiresIn);
    });

    it('should fail for exceeded usage limit', () => {
      const license = createTestLicense('usage', {
        usageRemaining: 5,
      });
      licenseManager.storeLicense(license);

      // Use all available uses
      for (let i = 0; i < 5; i++) {
        licenseManager.recordUsage(license.id);
      }

      const result = licenseManager.validateLicense(
        license.skillId,
        license.purchaserId
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Usage limit');
    });

    it('should return usageRemaining for usage license', () => {
      const license = createTestLicense('usage', {
        usageRemaining: 10,
      });
      licenseManager.storeLicense(license);
      licenseManager.recordUsage(license.id);

      const result = licenseManager.validateLicense(
        license.skillId,
        license.purchaserId
      );

      expect(result.valid).toBe(true);
      expect(result.usageRemaining).toBe(9);
    });
  });

  describe('recordUsage', () => {
    it('should increment usage count', () => {
      const license = createTestLicense('usage', { usageRemaining: 10 });
      licenseManager.storeLicense(license);

      licenseManager.recordUsage(license.id);
      licenseManager.recordUsage(license.id);

      const result = licenseManager.validateLicense(
        license.skillId,
        license.purchaserId
      );

      expect(result.usageRemaining).toBe(8);
    });
  });

  describe('revokeLicense', () => {
    it('should revoke license', () => {
      const license = createTestLicense('perpetual');
      licenseManager.storeLicense(license);

      licenseManager.revokeLicense(license.id, 'Abuse detected');

      const result = licenseManager.validateLicense(
        license.skillId,
        license.purchaserId
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('extendLicense', () => {
    it('should extend subscription license', () => {
      const license = createTestLicense('subscription', {
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      licenseManager.storeLicense(license);

      const additionalTime = 30 * 24 * 60 * 60 * 1000;
      licenseManager.extendLicense(license.id, additionalTime);

      const retrieved = licenseManager.getLicense(license.id);
      expect(retrieved?.expiresAt).toBeGreaterThan(license.expiresAt!);
    });

    it('should throw for non-existent license', () => {
      expect(() =>
        licenseManager.extendLicense('non-existent', 1000)
      ).toThrow('not found');
    });
  });

  describe('addUsage', () => {
    it('should add additional usage to license', () => {
      const license = createTestLicense('usage', { usageRemaining: 5 });
      licenseManager.storeLicense(license);

      licenseManager.addUsage(license.id, 10);

      const result = licenseManager.validateLicense(
        license.skillId,
        license.purchaserId
      );

      expect(result.usageRemaining).toBe(15);
    });
  });

  describe('signLicense', () => {
    it('should sign license data', () => {
      const license = createTestLicense('perpetual');
      delete (license as any).signature;

      const signature = licenseManager.signLicense(license, testPrivateKey);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const license = createTestLicense('perpetual');
      delete (license as any).signature;

      const signature = licenseManager.signLicense(license, testPrivateKey);
      license.signature = signature;

      const isValid = licenseManager.verifySignature(license, testPublicKey);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const license = createTestLicense('perpetual');
      license.signature = 'invalid-signature';

      const isValid = licenseManager.verifySignature(license, testPublicKey);

      expect(isValid).toBe(false);
    });

    it('should reject tampered license', () => {
      const license = createTestLicense('perpetual');
      delete (license as any).signature;

      const signature = licenseManager.signLicense(license, testPrivateKey);
      license.signature = signature;

      // Tamper with the license
      license.skillId = 'tampered-skill';

      const isValid = licenseManager.verifySignature(license, testPublicKey);

      expect(isValid).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return license statistics', () => {
      licenseManager.storeLicense(createTestLicense('perpetual'));
      licenseManager.storeLicense({
        ...createTestLicense('subscription'),
        id: 'sub-1',
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
      licenseManager.storeLicense({
        ...createTestLicense('subscription'),
        id: 'sub-2',
        expiresAt: Date.now() - 1000, // Expired
      });

      const stats = licenseManager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(2);
      expect(stats.expired).toBe(1);
      expect(stats.byType['perpetual']).toBe(1);
      expect(stats.byType['subscription']).toBe(2);
    });
  });

  describe('getExpiringLicenses', () => {
    it('should return licenses expiring within timeframe', () => {
      const sevenDays = 7 * 24 * 60 * 60 * 1000;

      licenseManager.storeLicense({
        ...createTestLicense('subscription'),
        id: 'expiring-soon',
        expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days
      });

      licenseManager.storeLicense({
        ...createTestLicense('subscription'),
        id: 'not-expiring-soon',
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      const expiring = licenseManager.getExpiringLicenses(sevenDays);

      expect(expiring).toHaveLength(1);
      expect(expiring[0].id).toBe('expiring-soon');
    });

    it('should not include already expired licenses', () => {
      licenseManager.storeLicense({
        ...createTestLicense('subscription'),
        id: 'already-expired',
        expiresAt: Date.now() - 1000,
      });

      const expiring = licenseManager.getExpiringLicenses();

      expect(expiring).toHaveLength(0);
    });
  });

  describe('cleanupExpired', () => {
    it('should count expired licenses', () => {
      licenseManager.storeLicense({
        ...createTestLicense('subscription'),
        id: 'expired-1',
        expiresAt: Date.now() - 1000,
      });
      licenseManager.storeLicense({
        ...createTestLicense('subscription'),
        id: 'expired-2',
        expiresAt: Date.now() - 2000,
      });

      const count = licenseManager.cleanupExpired();

      expect(count).toBe(2);
    });

    it('should delete old expired licenses when specified', () => {
      licenseManager.storeLicense({
        ...createTestLicense('subscription'),
        id: 'old-expired',
        expiresAt: Date.now() - 100 * 24 * 60 * 60 * 1000, // 100 days ago
      });

      const deleted = licenseManager.cleanupExpired(90 * 24 * 60 * 60 * 1000);

      expect(deleted).toBe(1);
      expect(licenseManager.getLicense('old-expired')).toBeNull();
    });
  });
});

// Helper function to create test license
function createTestLicense(
  type: 'perpetual' | 'subscription' | 'usage',
  overrides: Partial<{
    skillId: string;
    purchaserId: string;
    expiresAt: number;
    usageRemaining: number;
  }> = {}
) {
  return {
    id: `license-${Date.now()}`,
    skillId: overrides.skillId || 'test-skill',
    purchaserId: overrides.purchaserId || 'purchaser-1',
    type,
    issuedAt: Date.now(),
    expiresAt: overrides.expiresAt,
    usageRemaining: overrides.usageRemaining,
    signature: 'test-signature',
    receiptSignature: 'test-receipt-signature',
  };
}
