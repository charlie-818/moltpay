import nacl from 'tweetnacl';
import bs58 from 'bs58';
import * as crypto from 'crypto';
import { SkillMetadata, TrustLevel, SkillError } from '../skills/types';

export interface PublisherKey {
  publicKey: string;      // Base58-encoded Ed25519 public key
  name: string;
  trustLevel: TrustLevel;
  certifications?: string[];
  validFrom: number;
  validUntil?: number;
}

export interface SignedContent {
  content: string;        // The content that was signed
  signature: string;      // Base58-encoded signature
  publicKey: string;      // Base58-encoded public key of signer
  timestamp: number;      // When it was signed
}

export interface VerificationResult {
  valid: boolean;
  publisher?: PublisherKey;
  error?: string;
  trustLevel: TrustLevel;
}

export class SignatureVerifier {
  private trustedPublishers: Map<string, PublisherKey> = new Map();
  private revokedKeys: Set<string> = new Set();

  constructor(trustedPublishers?: PublisherKey[]) {
    if (trustedPublishers) {
      for (const publisher of trustedPublishers) {
        this.addTrustedPublisher(publisher);
      }
    }
  }

  /**
   * Add a trusted publisher
   */
  addTrustedPublisher(publisher: PublisherKey): void {
    this.trustedPublishers.set(publisher.publicKey, publisher);
  }

  /**
   * Remove a trusted publisher
   */
  removeTrustedPublisher(publicKey: string): void {
    this.trustedPublishers.delete(publicKey);
  }

  /**
   * Revoke a key (mark as compromised)
   */
  revokeKey(publicKey: string): void {
    this.revokedKeys.add(publicKey);
    this.trustedPublishers.delete(publicKey);
  }

  /**
   * Check if a key is revoked
   */
  isRevoked(publicKey: string): boolean {
    return this.revokedKeys.has(publicKey);
  }

  /**
   * Sign content with a private key
   */
  sign(content: string, privateKeyBase58: string): SignedContent {
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    const contentBytes = Buffer.from(content, 'utf-8');

    // Ed25519 private key is 64 bytes (32 byte seed + 32 byte public key)
    const signature = nacl.sign.detached(contentBytes, privateKeyBytes);

    // Extract public key from private key
    const publicKey = privateKeyBytes.slice(32);

    return {
      content,
      signature: bs58.encode(signature),
      publicKey: bs58.encode(publicKey),
      timestamp: Date.now(),
    };
  }

  /**
   * Verify a signature
   */
  verify(signed: SignedContent): VerificationResult {
    try {
      // Check if key is revoked
      if (this.isRevoked(signed.publicKey)) {
        return {
          valid: false,
          error: 'Key has been revoked',
          trustLevel: 'untrusted',
        };
      }

      // Decode signature and public key
      const signatureBytes = bs58.decode(signed.signature);
      const publicKeyBytes = bs58.decode(signed.publicKey);
      const contentBytes = Buffer.from(signed.content, 'utf-8');

      // Verify signature
      const valid = nacl.sign.detached.verify(
        contentBytes,
        signatureBytes,
        publicKeyBytes
      );

      if (!valid) {
        return {
          valid: false,
          error: 'Invalid signature',
          trustLevel: 'untrusted',
        };
      }

      // Look up publisher
      const publisher = this.trustedPublishers.get(signed.publicKey);

      if (publisher) {
        // Check validity period
        const now = Date.now();
        if (publisher.validFrom > now) {
          return {
            valid: false,
            error: 'Publisher key not yet valid',
            trustLevel: 'untrusted',
          };
        }
        if (publisher.validUntil && publisher.validUntil < now) {
          return {
            valid: false,
            error: 'Publisher key has expired',
            trustLevel: 'untrusted',
          };
        }

        return {
          valid: true,
          publisher,
          trustLevel: publisher.trustLevel,
        };
      }

      // Valid signature but unknown publisher
      return {
        valid: true,
        trustLevel: 'community',
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
        trustLevel: 'untrusted',
      };
    }
  }

  /**
   * Verify a skill's signature
   */
  verifySkill(
    content: string,
    metadata: SkillMetadata
  ): VerificationResult {
    if (!metadata.signature) {
      return {
        valid: false,
        error: 'Skill is not signed',
        trustLevel: 'untrusted',
      };
    }

    if (!metadata.publisherId) {
      return {
        valid: false,
        error: 'Publisher ID is required for verification',
        trustLevel: 'untrusted',
      };
    }

    // Reconstruct signed content
    const signed: SignedContent = {
      content,
      signature: metadata.signature,
      publicKey: metadata.publisherId,
      timestamp: metadata.lastUpdated || Date.now(),
    };

    return this.verify(signed);
  }

  /**
   * Generate a new keypair
   */
  generateKeyPair(): { publicKey: string; privateKey: string } {
    const keypair = nacl.sign.keyPair();

    return {
      publicKey: bs58.encode(keypair.publicKey),
      privateKey: bs58.encode(keypair.secretKey),
    };
  }

  /**
   * Create a content hash for signing
   */
  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Verify a hash matches content
   */
  verifyHash(content: string, hash: string): boolean {
    const computed = this.hashContent(content);
    return computed === hash;
  }

  /**
   * Create a signed skill package
   */
  signSkill(
    content: string,
    privateKeyBase58: string,
    metadata: Partial<SkillMetadata>
  ): { content: string; signature: string; hash: string } {
    const hash = this.hashContent(content);
    const signed = this.sign(hash, privateKeyBase58);

    return {
      content,
      signature: signed.signature,
      hash,
    };
  }

  /**
   * Get all trusted publishers
   */
  getTrustedPublishers(): PublisherKey[] {
    return Array.from(this.trustedPublishers.values());
  }

  /**
   * Get publishers by trust level
   */
  getPublishersByTrustLevel(trustLevel: TrustLevel): PublisherKey[] {
    return Array.from(this.trustedPublishers.values())
      .filter(p => p.trustLevel === trustLevel);
  }

  /**
   * Check if a publisher has a specific certification
   */
  hasCertification(publicKey: string, certification: string): boolean {
    const publisher = this.trustedPublishers.get(publicKey);
    return publisher?.certifications?.includes(certification) || false;
  }

  /**
   * Import trusted publishers from JSON
   */
  importPublishers(json: string): void {
    const publishers = JSON.parse(json) as PublisherKey[];
    for (const publisher of publishers) {
      this.addTrustedPublisher(publisher);
    }
  }

  /**
   * Export trusted publishers to JSON
   */
  exportPublishers(): string {
    return JSON.stringify(Array.from(this.trustedPublishers.values()), null, 2);
  }
}
