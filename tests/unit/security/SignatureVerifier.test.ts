import { describe, it, expect, beforeEach } from 'vitest';
import { SignatureVerifier } from '../../../src/security/SignatureVerifier';

describe('SignatureVerifier', () => {
  let verifier: SignatureVerifier;

  beforeEach(() => {
    verifier = new SignatureVerifier();
  });

  describe('generateKeyPair', () => {
    it('should generate valid keypair', () => {
      const keypair = verifier.generateKeyPair();

      expect(keypair.publicKey).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
      expect(typeof keypair.publicKey).toBe('string');
      expect(typeof keypair.privateKey).toBe('string');
    });

    it('should generate unique keypairs', () => {
      const keypair1 = verifier.generateKeyPair();
      const keypair2 = verifier.generateKeyPair();

      expect(keypair1.publicKey).not.toBe(keypair2.publicKey);
      expect(keypair1.privateKey).not.toBe(keypair2.privateKey);
    });
  });

  describe('sign', () => {
    it('should sign content', () => {
      const keypair = verifier.generateKeyPair();
      const content = 'Hello, World!';

      const signed = verifier.sign(content, keypair.privateKey);

      expect(signed.content).toBe(content);
      expect(signed.signature).toBeDefined();
      expect(signed.publicKey).toBe(keypair.publicKey);
      expect(signed.timestamp).toBeDefined();
    });

    it('should produce different signatures for different content', () => {
      const keypair = verifier.generateKeyPair();

      const signed1 = verifier.sign('Content 1', keypair.privateKey);
      const signed2 = verifier.sign('Content 2', keypair.privateKey);

      expect(signed1.signature).not.toBe(signed2.signature);
    });

    it('should produce same signature for same content with same key', () => {
      const keypair = verifier.generateKeyPair();
      const content = 'Same content';

      const signed1 = verifier.sign(content, keypair.privateKey);
      const signed2 = verifier.sign(content, keypair.privateKey);

      expect(signed1.signature).toBe(signed2.signature);
    });
  });

  describe('verify', () => {
    it('should verify valid signature', () => {
      const keypair = verifier.generateKeyPair();
      const signed = verifier.sign('Test content', keypair.privateKey);

      const result = verifier.verify(signed);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const keypair = verifier.generateKeyPair();
      const signed = verifier.sign('Test content', keypair.privateKey);

      // Tamper with signature
      signed.signature = 'invalid-signature';

      const result = verifier.verify(signed);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject tampered content', () => {
      const keypair = verifier.generateKeyPair();
      const signed = verifier.sign('Original content', keypair.privateKey);

      // Tamper with content
      signed.content = 'Tampered content';

      const result = verifier.verify(signed);

      expect(result.valid).toBe(false);
    });

    it('should reject revoked key', () => {
      const keypair = verifier.generateKeyPair();
      const signed = verifier.sign('Test content', keypair.privateKey);

      verifier.revokeKey(keypair.publicKey);

      const result = verifier.verify(signed);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('should return community trust level for unknown publisher', () => {
      const keypair = verifier.generateKeyPair();
      const signed = verifier.sign('Test content', keypair.privateKey);

      const result = verifier.verify(signed);

      expect(result.valid).toBe(true);
      expect(result.trustLevel).toBe('community');
    });

    it('should return publisher trust level for known publisher', () => {
      const keypair = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair.publicKey,
        name: 'Test Publisher',
        trustLevel: 'verified',
        validFrom: Date.now() - 1000,
      });

      const signed = verifier.sign('Test content', keypair.privateKey);
      const result = verifier.verify(signed);

      expect(result.valid).toBe(true);
      expect(result.trustLevel).toBe('verified');
      expect(result.publisher).toBeDefined();
    });

    it('should reject signature from not-yet-valid publisher', () => {
      const keypair = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair.publicKey,
        name: 'Future Publisher',
        trustLevel: 'verified',
        validFrom: Date.now() + 10000, // In the future
      });

      const signed = verifier.sign('Test content', keypair.privateKey);
      const result = verifier.verify(signed);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not yet valid');
    });

    it('should reject signature from expired publisher', () => {
      const keypair = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair.publicKey,
        name: 'Expired Publisher',
        trustLevel: 'verified',
        validFrom: Date.now() - 10000,
        validUntil: Date.now() - 1000, // Already expired
      });

      const signed = verifier.sign('Test content', keypair.privateKey);
      const result = verifier.verify(signed);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('addTrustedPublisher', () => {
    it('should add publisher', () => {
      const keypair = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair.publicKey,
        name: 'Test Publisher',
        trustLevel: 'verified',
        validFrom: Date.now(),
      });

      const publishers = verifier.getTrustedPublishers();
      expect(publishers).toHaveLength(1);
      expect(publishers[0].publicKey).toBe(keypair.publicKey);
    });
  });

  describe('removeTrustedPublisher', () => {
    it('should remove publisher', () => {
      const keypair = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair.publicKey,
        name: 'Test Publisher',
        trustLevel: 'verified',
        validFrom: Date.now(),
      });

      verifier.removeTrustedPublisher(keypair.publicKey);

      const publishers = verifier.getTrustedPublishers();
      expect(publishers).toHaveLength(0);
    });
  });

  describe('revokeKey', () => {
    it('should mark key as revoked', () => {
      const keypair = verifier.generateKeyPair();

      verifier.revokeKey(keypair.publicKey);

      expect(verifier.isRevoked(keypair.publicKey)).toBe(true);
    });

    it('should remove from trusted publishers', () => {
      const keypair = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair.publicKey,
        name: 'Test Publisher',
        trustLevel: 'verified',
        validFrom: Date.now(),
      });

      verifier.revokeKey(keypair.publicKey);

      const publishers = verifier.getTrustedPublishers();
      expect(publishers).toHaveLength(0);
    });
  });

  describe('isRevoked', () => {
    it('should return false for non-revoked key', () => {
      const keypair = verifier.generateKeyPair();

      expect(verifier.isRevoked(keypair.publicKey)).toBe(false);
    });
  });

  describe('verifySkill', () => {
    it('should verify signed skill', () => {
      const keypair = verifier.generateKeyPair();
      const content = 'Skill content';
      const hash = verifier.hashContent(content);
      const signed = verifier.sign(hash, keypair.privateKey);

      const result = verifier.verifySkill(content, {
        id: 'test-skill',
        name: 'Test',
        description: 'Test skill',
        version: '1.0.0',
        license: 'MIT',
        tags: [],
        allowedTools: [],
        requiredTools: [],
        permissions: [],
        trustLevel: 'community',
        signature: signed.signature,
        publisherId: keypair.publicKey,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject unsigned skill', () => {
      const result = verifier.verifySkill('Content', {
        id: 'test-skill',
        name: 'Test',
        description: 'Test skill',
        version: '1.0.0',
        license: 'MIT',
        tags: [],
        allowedTools: [],
        requiredTools: [],
        permissions: [],
        trustLevel: 'community',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not signed');
    });

    it('should reject skill without publisher ID', () => {
      const result = verifier.verifySkill('Content', {
        id: 'test-skill',
        name: 'Test',
        description: 'Test skill',
        version: '1.0.0',
        license: 'MIT',
        tags: [],
        allowedTools: [],
        requiredTools: [],
        permissions: [],
        trustLevel: 'community',
        signature: 'some-signature',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Publisher ID');
    });
  });

  describe('hashContent', () => {
    it('should produce consistent hash', () => {
      const content = 'Test content';

      const hash1 = verifier.hashContent(content);
      const hash2 = verifier.hashContent(content);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different content', () => {
      const hash1 = verifier.hashContent('Content 1');
      const hash2 = verifier.hashContent('Content 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce hex string', () => {
      const hash = verifier.hashContent('Test');

      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('verifyHash', () => {
    it('should verify matching hash', () => {
      const content = 'Test content';
      const hash = verifier.hashContent(content);

      expect(verifier.verifyHash(content, hash)).toBe(true);
    });

    it('should reject non-matching hash', () => {
      expect(verifier.verifyHash('Content', 'wrong-hash')).toBe(false);
    });
  });

  describe('signSkill', () => {
    it('should sign skill content', () => {
      const keypair = verifier.generateKeyPair();
      const content = 'Skill content';

      const result = verifier.signSkill(content, keypair.privateKey, {
        name: 'Test Skill',
      });

      expect(result.content).toBe(content);
      expect(result.signature).toBeDefined();
      expect(result.hash).toBeDefined();
    });
  });

  describe('getTrustedPublishers', () => {
    it('should return all publishers', () => {
      const keypair1 = verifier.generateKeyPair();
      const keypair2 = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair1.publicKey,
        name: 'Publisher 1',
        trustLevel: 'verified',
        validFrom: Date.now(),
      });

      verifier.addTrustedPublisher({
        publicKey: keypair2.publicKey,
        name: 'Publisher 2',
        trustLevel: 'system',
        validFrom: Date.now(),
      });

      const publishers = verifier.getTrustedPublishers();
      expect(publishers).toHaveLength(2);
    });
  });

  describe('getPublishersByTrustLevel', () => {
    it('should filter by trust level', () => {
      const keypair1 = verifier.generateKeyPair();
      const keypair2 = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair1.publicKey,
        name: 'Verified Publisher',
        trustLevel: 'verified',
        validFrom: Date.now(),
      });

      verifier.addTrustedPublisher({
        publicKey: keypair2.publicKey,
        name: 'System Publisher',
        trustLevel: 'system',
        validFrom: Date.now(),
      });

      const verified = verifier.getPublishersByTrustLevel('verified');
      expect(verified).toHaveLength(1);
      expect(verified[0].name).toBe('Verified Publisher');
    });
  });

  describe('hasCertification', () => {
    it('should check publisher certification', () => {
      const keypair = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair.publicKey,
        name: 'Certified Publisher',
        trustLevel: 'verified',
        certifications: ['AIUC-1', 'Audited'],
        validFrom: Date.now(),
      });

      expect(verifier.hasCertification(keypair.publicKey, 'AIUC-1')).toBe(true);
      expect(verifier.hasCertification(keypair.publicKey, 'Unknown')).toBe(false);
    });

    it('should return false for unknown publisher', () => {
      expect(verifier.hasCertification('unknown-key', 'AIUC-1')).toBe(false);
    });
  });

  describe('importPublishers/exportPublishers', () => {
    it('should export and import publishers', () => {
      const keypair = verifier.generateKeyPair();

      verifier.addTrustedPublisher({
        publicKey: keypair.publicKey,
        name: 'Test Publisher',
        trustLevel: 'verified',
        validFrom: Date.now(),
      });

      const exported = verifier.exportPublishers();

      // Create new verifier and import
      const newVerifier = new SignatureVerifier();
      newVerifier.importPublishers(exported);

      const publishers = newVerifier.getTrustedPublishers();
      expect(publishers).toHaveLength(1);
      expect(publishers[0].publicKey).toBe(keypair.publicKey);
    });
  });
});
