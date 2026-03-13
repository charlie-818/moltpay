import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {
  License,
  SkillPricing,
  LicenseError,
} from '../skills/types';

export interface LicenseManagerConfig {
  dbPath?: string;
  inMemory?: boolean;
}

export interface LicenseValidation {
  valid: boolean;
  license?: License;
  error?: string;
  expiresIn?: number;  // ms until expiry
  usageRemaining?: number;
}

export interface LicenseStats {
  total: number;
  active: number;
  expired: number;
  byType: Record<string, number>;
}

export class LicenseManager {
  private db: Database.Database;

  constructor(config: LicenseManagerConfig = {}) {
    if (config.inMemory) {
      this.db = new Database(':memory:');
    } else {
      const dbPath = config.dbPath || this.getDefaultDbPath();
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new Database(dbPath);
    }

    this.initializeSchema();
  }

  private getDefaultDbPath(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    return path.join(homeDir, '.moltpay', 'licenses.db');
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        purchaser_id TEXT NOT NULL,
        type TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER,
        usage_limit INTEGER,
        usage_count INTEGER DEFAULT 0,
        signature TEXT NOT NULL,
        receipt_signature TEXT NOT NULL,
        revoked INTEGER DEFAULT 0,
        revoked_at INTEGER,
        revoke_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_license_skill ON licenses(skill_id);
      CREATE INDEX IF NOT EXISTS idx_license_purchaser ON licenses(purchaser_id);
      CREATE INDEX IF NOT EXISTS idx_license_type ON licenses(type);
      CREATE INDEX IF NOT EXISTS idx_license_expires ON licenses(expires_at);
    `);
  }

  /**
   * Store a new license
   */
  storeLicense(license: License): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO licenses (
        id, skill_id, purchaser_id, type, issued_at, expires_at,
        usage_limit, signature, receipt_signature
      ) VALUES (
        @id, @skillId, @purchaserId, @type, @issuedAt, @expiresAt,
        @usageLimit, @signature, @receiptSignature
      )
    `);

    stmt.run({
      id: license.id,
      skillId: license.skillId,
      purchaserId: license.purchaserId,
      type: license.type,
      issuedAt: license.issuedAt,
      expiresAt: license.expiresAt || null,
      usageLimit: license.usageRemaining || null,
      signature: license.signature,
      receiptSignature: license.receiptSignature,
    });
  }

  /**
   * Get a license by ID
   */
  getLicense(licenseId: string): License | null {
    const stmt = this.db.prepare('SELECT * FROM licenses WHERE id = ?');
    const row = stmt.get(licenseId) as LicenseRow | undefined;

    if (!row) return null;
    return this.rowToLicense(row);
  }

  /**
   * Get license for a skill and purchaser
   */
  getSkillLicense(skillId: string, purchaserId: string): License | null {
    const stmt = this.db.prepare(`
      SELECT * FROM licenses
      WHERE skill_id = ? AND purchaser_id = ? AND revoked = 0
      ORDER BY issued_at DESC LIMIT 1
    `);
    const row = stmt.get(skillId, purchaserId) as LicenseRow | undefined;

    if (!row) return null;
    return this.rowToLicense(row);
  }

  /**
   * Get all licenses for a purchaser
   */
  getLicensesByPurchaser(purchaserId: string): License[] {
    const stmt = this.db.prepare(`
      SELECT * FROM licenses WHERE purchaser_id = ? ORDER BY issued_at DESC
    `);
    const rows = stmt.all(purchaserId) as LicenseRow[];
    return rows.map(row => this.rowToLicense(row));
  }

  /**
   * Get all licenses for a skill
   */
  getLicensesBySkill(skillId: string): License[] {
    const stmt = this.db.prepare(`
      SELECT * FROM licenses WHERE skill_id = ? ORDER BY issued_at DESC
    `);
    const rows = stmt.all(skillId) as LicenseRow[];
    return rows.map(row => this.rowToLicense(row));
  }

  /**
   * Validate a license
   */
  validateLicense(skillId: string, purchaserId: string): LicenseValidation {
    const license = this.getSkillLicense(skillId, purchaserId);

    if (!license) {
      return {
        valid: false,
        error: 'No license found',
      };
    }

    // Check if revoked
    const row = this.db.prepare('SELECT revoked FROM licenses WHERE id = ?')
      .get(license.id) as { revoked: number } | undefined;

    if (row?.revoked) {
      return {
        valid: false,
        license,
        error: 'License has been revoked',
      };
    }

    // Check expiry
    if (license.expiresAt) {
      const now = Date.now();
      if (license.expiresAt < now) {
        return {
          valid: false,
          license,
          error: 'License has expired',
        };
      }

      return {
        valid: true,
        license,
        expiresIn: license.expiresAt - now,
      };
    }

    // Check usage limit
    if (license.usageRemaining !== undefined) {
      const row = this.db.prepare('SELECT usage_count FROM licenses WHERE id = ?')
        .get(license.id) as { usage_count: number } | undefined;

      const usageCount = row?.usage_count || 0;

      if (usageCount >= license.usageRemaining) {
        return {
          valid: false,
          license,
          error: 'Usage limit exceeded',
          usageRemaining: 0,
        };
      }

      return {
        valid: true,
        license,
        usageRemaining: license.usageRemaining - usageCount,
      };
    }

    // Perpetual license
    return {
      valid: true,
      license,
    };
  }

  /**
   * Record a usage of the license
   */
  recordUsage(licenseId: string): void {
    const stmt = this.db.prepare(`
      UPDATE licenses SET usage_count = usage_count + 1 WHERE id = ?
    `);
    stmt.run(licenseId);
  }

  /**
   * Revoke a license
   */
  revokeLicense(licenseId: string, reason: string): void {
    const stmt = this.db.prepare(`
      UPDATE licenses SET revoked = 1, revoked_at = ?, revoke_reason = ? WHERE id = ?
    `);
    stmt.run(Date.now(), reason, licenseId);
  }

  /**
   * Extend a license
   */
  extendLicense(licenseId: string, additionalTime: number): void {
    const license = this.getLicense(licenseId);
    if (!license) {
      throw new LicenseError(`License not found: ${licenseId}`);
    }

    const currentExpiry = license.expiresAt || Date.now();
    const newExpiry = currentExpiry + additionalTime;

    const stmt = this.db.prepare(`
      UPDATE licenses SET expires_at = ? WHERE id = ?
    `);
    stmt.run(newExpiry, licenseId);
  }

  /**
   * Add usage to a license
   */
  addUsage(licenseId: string, additionalUsage: number): void {
    const stmt = this.db.prepare(`
      UPDATE licenses SET usage_limit = COALESCE(usage_limit, 0) + ? WHERE id = ?
    `);
    stmt.run(additionalUsage, licenseId);
  }

  /**
   * Generate a license signature
   */
  signLicense(
    license: Omit<License, 'signature'>,
    publisherPrivateKey: string
  ): string {
    const data = JSON.stringify({
      id: license.id,
      skillId: license.skillId,
      purchaserId: license.purchaserId,
      type: license.type,
      issuedAt: license.issuedAt,
      expiresAt: license.expiresAt,
      usageRemaining: license.usageRemaining,
    });

    const privateKeyBytes = bs58.decode(publisherPrivateKey);
    const dataBytes = Buffer.from(data, 'utf-8');
    const signature = nacl.sign.detached(dataBytes, privateKeyBytes);

    return bs58.encode(signature);
  }

  /**
   * Verify a license signature
   */
  verifySignature(license: License, publisherPublicKey: string): boolean {
    try {
      const data = JSON.stringify({
        id: license.id,
        skillId: license.skillId,
        purchaserId: license.purchaserId,
        type: license.type,
        issuedAt: license.issuedAt,
        expiresAt: license.expiresAt,
        usageRemaining: license.usageRemaining,
      });

      const publicKeyBytes = bs58.decode(publisherPublicKey);
      const signatureBytes = bs58.decode(license.signature);
      const dataBytes = Buffer.from(data, 'utf-8');

      return nacl.sign.detached.verify(dataBytes, signatureBytes, publicKeyBytes);
    } catch {
      return false;
    }
  }

  /**
   * Get license statistics
   */
  getStats(): LicenseStats {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM licenses');
    const { count: total } = totalStmt.get() as { count: number };

    const now = Date.now();
    const activeStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM licenses
      WHERE revoked = 0 AND (expires_at IS NULL OR expires_at > ?)
    `);
    const { count: active } = activeStmt.get(now) as { count: number };

    const expiredStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM licenses
      WHERE expires_at IS NOT NULL AND expires_at <= ?
    `);
    const { count: expired } = expiredStmt.get(now) as { count: number };

    const byTypeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM licenses GROUP BY type
    `);
    const byTypeRows = byTypeStmt.all() as { type: string; count: number }[];

    return {
      total,
      active,
      expired,
      byType: Object.fromEntries(byTypeRows.map(r => [r.type, r.count])),
    };
  }

  /**
   * Get expiring licenses
   */
  getExpiringLicenses(withinMs: number = 7 * 24 * 60 * 60 * 1000): License[] {
    const now = Date.now();
    const cutoff = now + withinMs;

    const stmt = this.db.prepare(`
      SELECT * FROM licenses
      WHERE expires_at IS NOT NULL
        AND expires_at > ?
        AND expires_at <= ?
        AND revoked = 0
      ORDER BY expires_at ASC
    `);
    const rows = stmt.all(now, cutoff) as LicenseRow[];
    return rows.map(row => this.rowToLicense(row));
  }

  /**
   * Cleanup expired licenses (optionally delete them)
   */
  cleanupExpired(deleteOlderThanMs?: number): number {
    if (deleteOlderThanMs) {
      const cutoff = Date.now() - deleteOlderThanMs;
      const stmt = this.db.prepare(`
        DELETE FROM licenses WHERE expires_at IS NOT NULL AND expires_at < ?
      `);
      const result = stmt.run(cutoff);
      return result.changes;
    }

    // Just count expired
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM licenses
      WHERE expires_at IS NOT NULL AND expires_at < ?
    `);
    const { count } = stmt.get(Date.now()) as { count: number };
    return count;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Convert database row to License
   */
  private rowToLicense(row: LicenseRow): License {
    return {
      id: row.id,
      skillId: row.skill_id,
      purchaserId: row.purchaser_id,
      type: row.type as License['type'],
      issuedAt: row.issued_at,
      expiresAt: row.expires_at || undefined,
      usageRemaining: row.usage_limit || undefined,
      signature: row.signature,
      receiptSignature: row.receipt_signature,
    };
  }
}

interface LicenseRow {
  id: string;
  skill_id: string;
  purchaser_id: string;
  type: string;
  issued_at: number;
  expires_at: number | null;
  usage_limit: number | null;
  usage_count: number;
  signature: string;
  receipt_signature: string;
  revoked: number;
  revoked_at: number | null;
  revoke_reason: string | null;
}
