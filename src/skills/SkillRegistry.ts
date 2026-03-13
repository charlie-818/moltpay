import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import {
  InstalledSkill,
  SkillMetadata,
  Permission,
  AutonomyTier,
  SkillSource,
  TrustLevel,
  SkillError,
} from './types';

export interface RegistryConfig {
  dbPath?: string;
  inMemory?: boolean;
}

export interface SkillQuery {
  enabled?: boolean;
  source?: SkillSource;
  trustLevel?: TrustLevel[];
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export class SkillRegistry {
  private db: Database.Database;

  constructor(config: RegistryConfig = {}) {
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
    return path.join(homeDir, '.moltpay', 'skills.db');
  }

  private initializeSchema(): void {
    this.db.exec(`
      -- Skills table
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT NOT NULL DEFAULT '1.0.0',
        author TEXT,
        license TEXT DEFAULT 'MIT',
        tags TEXT,
        allowed_tools TEXT,
        required_tools TEXT,
        permissions TEXT,
        trust_level TEXT NOT NULL DEFAULT 'untrusted',
        pricing_model TEXT,
        pricing_amount REAL,
        pricing_currency TEXT DEFAULT 'SOL',
        pricing_interval TEXT,
        publisher_id TEXT,
        publisher_name TEXT,
        signature TEXT,
        install_count INTEGER DEFAULT 0,
        rating REAL,
        review_count INTEGER DEFAULT 0,
        certifications TEXT,
        instructions TEXT NOT NULL,
        source TEXT NOT NULL,
        source_path TEXT NOT NULL,
        installed_at INTEGER NOT NULL,
        last_updated INTEGER,
        last_used_at INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        autonomy_tier TEXT NOT NULL DEFAULT 'observe_suggest',
        license_key TEXT,
        license_expires_at INTEGER
      );

      -- Permissions table
      CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        resource TEXT,
        expires_at INTEGER,
        granted_at INTEGER NOT NULL,
        granted_by TEXT NOT NULL,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      );

      -- Indices
      CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
      CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
      CREATE INDEX IF NOT EXISTS idx_skills_trust_level ON skills(trust_level);
      CREATE INDEX IF NOT EXISTS idx_permissions_skill ON permissions(skill_id);

      -- Full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
        id, name, description, tags, instructions,
        content='skills',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
        INSERT INTO skills_fts(rowid, id, name, description, tags, instructions)
        VALUES (new.rowid, new.id, new.name, new.description, new.tags, new.instructions);
      END;

      CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
        INSERT INTO skills_fts(skills_fts, rowid, id, name, description, tags, instructions)
        VALUES('delete', old.rowid, old.id, old.name, old.description, old.tags, old.instructions);
      END;

      CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
        INSERT INTO skills_fts(skills_fts, rowid, id, name, description, tags, instructions)
        VALUES('delete', old.rowid, old.id, old.name, old.description, old.tags, old.instructions);
        INSERT INTO skills_fts(rowid, id, name, description, tags, instructions)
        VALUES (new.rowid, new.id, new.name, new.description, new.tags, new.instructions);
      END;
    `);
  }

  /**
   * Register a new skill
   */
  register(skill: InstalledSkill): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO skills (
        id, name, description, version, author, license,
        tags, allowed_tools, required_tools, permissions,
        trust_level, pricing_model, pricing_amount, pricing_currency,
        pricing_interval, publisher_id, publisher_name, signature,
        install_count, rating, review_count, certifications,
        instructions, source, source_path, installed_at, last_updated,
        last_used_at, enabled, autonomy_tier, license_key, license_expires_at
      ) VALUES (
        @id, @name, @description, @version, @author, @license,
        @tags, @allowedTools, @requiredTools, @permissions,
        @trustLevel, @pricingModel, @pricingAmount, @pricingCurrency,
        @pricingInterval, @publisherId, @publisherName, @signature,
        @installCount, @rating, @reviewCount, @certifications,
        @instructions, @source, @sourcePath, @installedAt, @lastUpdated,
        @lastUsedAt, @enabled, @autonomyTier, @licenseKey, @licenseExpiresAt
      )
    `);

    const { metadata, grantedPermissions, ...rest } = skill;

    stmt.run({
      id: skill.id,
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      author: metadata.author || null,
      license: metadata.license,
      tags: JSON.stringify(metadata.tags),
      allowedTools: JSON.stringify(metadata.allowedTools),
      requiredTools: JSON.stringify(metadata.requiredTools),
      permissions: JSON.stringify(metadata.permissions),
      trustLevel: metadata.trustLevel,
      pricingModel: metadata.pricing?.model || null,
      pricingAmount: metadata.pricing?.amount || null,
      pricingCurrency: metadata.pricing?.currency || 'SOL',
      pricingInterval: metadata.pricing?.interval || null,
      publisherId: metadata.publisherId || null,
      publisherName: metadata.publisherName || null,
      signature: metadata.signature || null,
      installCount: metadata.installCount || 0,
      rating: metadata.rating || null,
      reviewCount: metadata.reviewCount || 0,
      certifications: metadata.certifications ? JSON.stringify(metadata.certifications) : null,
      instructions: skill.instructions,
      source: skill.source,
      sourcePath: skill.sourcePath,
      installedAt: skill.installedAt,
      lastUpdated: Date.now(),
      lastUsedAt: skill.lastUsedAt || null,
      enabled: skill.enabled ? 1 : 0,
      autonomyTier: skill.autonomyTier,
      licenseKey: skill.licenseKey || null,
      licenseExpiresAt: skill.licenseExpiresAt || null,
    });

    // Store permissions
    this.setPermissions(skill.id, grantedPermissions);
  }

  /**
   * Unregister a skill
   */
  unregister(skillId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM skills WHERE id = ?');
    const result = stmt.run(skillId);
    return result.changes > 0;
  }

  /**
   * Get a skill by ID
   */
  get(skillId: string): InstalledSkill | null {
    const stmt = this.db.prepare('SELECT * FROM skills WHERE id = ?');
    const row = stmt.get(skillId) as SkillRow | undefined;

    if (!row) return null;

    return this.rowToSkill(row);
  }

  /**
   * Get all installed skills
   */
  getAll(): InstalledSkill[] {
    const stmt = this.db.prepare('SELECT * FROM skills ORDER BY installed_at DESC');
    const rows = stmt.all() as SkillRow[];
    return rows.map(row => this.rowToSkill(row));
  }

  /**
   * Query skills with filters
   */
  query(query: SkillQuery): InstalledSkill[] {
    let sql = 'SELECT * FROM skills WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (query.enabled !== undefined) {
      sql += ' AND enabled = @enabled';
      params.enabled = query.enabled ? 1 : 0;
    }

    if (query.source) {
      sql += ' AND source = @source';
      params.source = query.source;
    }

    if (query.trustLevel && query.trustLevel.length > 0) {
      const placeholders = query.trustLevel.map((_, i) => `@tl${i}`).join(', ');
      sql += ` AND trust_level IN (${placeholders})`;
      query.trustLevel.forEach((tl, i) => {
        params[`tl${i}`] = tl;
      });
    }

    if (query.tags && query.tags.length > 0) {
      // SQLite JSON functions for tag matching
      const tagConditions = query.tags.map((_, i) => `tags LIKE @tag${i}`).join(' OR ');
      sql += ` AND (${tagConditions})`;
      query.tags.forEach((tag, i) => {
        params[`tag${i}`] = `%"${tag}"%`;
      });
    }

    if (query.search) {
      // Use FTS for search
      sql = `
        SELECT s.* FROM skills s
        JOIN skills_fts fts ON s.id = fts.id
        WHERE skills_fts MATCH @search
        ${query.enabled !== undefined ? 'AND s.enabled = @enabled' : ''}
        ${query.source ? 'AND s.source = @source' : ''}
      `;
      params.search = query.search;
    }

    sql += ' ORDER BY installed_at DESC';

    if (query.limit) {
      sql += ' LIMIT @limit';
      params.limit = query.limit;
    } else if (query.offset) {
      // SQLite requires LIMIT before OFFSET, use -1 for unlimited
      sql += ' LIMIT -1';
    }

    if (query.offset) {
      sql += ' OFFSET @offset';
      params.offset = query.offset;
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params) as SkillRow[];
    return rows.map(row => this.rowToSkill(row));
  }

  /**
   * Update skill enabled status
   */
  setEnabled(skillId: string, enabled: boolean): void {
    const stmt = this.db.prepare('UPDATE skills SET enabled = ? WHERE id = ?');
    stmt.run(enabled ? 1 : 0, skillId);
  }

  /**
   * Update skill autonomy tier
   */
  setAutonomyTier(skillId: string, tier: AutonomyTier): void {
    const stmt = this.db.prepare('UPDATE skills SET autonomy_tier = ? WHERE id = ?');
    stmt.run(tier, skillId);
  }

  /**
   * Update last used timestamp
   */
  updateLastUsed(skillId: string): void {
    const stmt = this.db.prepare('UPDATE skills SET last_used_at = ? WHERE id = ?');
    stmt.run(Date.now(), skillId);
  }

  /**
   * Set permissions for a skill
   */
  setPermissions(skillId: string, permissions: Permission[]): void {
    // Clear existing permissions
    const deleteStmt = this.db.prepare('DELETE FROM permissions WHERE skill_id = ?');
    deleteStmt.run(skillId);

    // Insert new permissions
    const insertStmt = this.db.prepare(`
      INSERT INTO permissions (skill_id, scope, resource, expires_at, granted_at, granted_by)
      VALUES (@skillId, @scope, @resource, @expiresAt, @grantedAt, @grantedBy)
    `);

    for (const perm of permissions) {
      insertStmt.run({
        skillId,
        scope: perm.scope,
        resource: perm.resource || null,
        expiresAt: perm.expiresAt || null,
        grantedAt: perm.grantedAt,
        grantedBy: perm.grantedBy,
      });
    }
  }

  /**
   * Get permissions for a skill
   */
  getPermissions(skillId: string): Permission[] {
    const stmt = this.db.prepare('SELECT * FROM permissions WHERE skill_id = ?');
    const rows = stmt.all(skillId) as PermissionRow[];

    return rows.map(row => ({
      scope: row.scope as Permission['scope'],
      resource: row.resource || undefined,
      expiresAt: row.expires_at || undefined,
      grantedAt: row.granted_at,
      grantedBy: row.granted_by as Permission['grantedBy'],
    }));
  }

  /**
   * Add a permission for a skill
   */
  addPermission(skillId: string, permission: Permission): void {
    const stmt = this.db.prepare(`
      INSERT INTO permissions (skill_id, scope, resource, expires_at, granted_at, granted_by)
      VALUES (@skillId, @scope, @resource, @expiresAt, @grantedAt, @grantedBy)
    `);

    stmt.run({
      skillId,
      scope: permission.scope,
      resource: permission.resource || null,
      expiresAt: permission.expiresAt || null,
      grantedAt: permission.grantedAt,
      grantedBy: permission.grantedBy,
    });
  }

  /**
   * Revoke a permission
   */
  revokePermission(skillId: string, scope: string, resource?: string): void {
    let sql = 'DELETE FROM permissions WHERE skill_id = ? AND scope = ?';
    const params: (string | undefined)[] = [skillId, scope];

    if (resource) {
      sql += ' AND resource = ?';
      params.push(resource);
    }

    const stmt = this.db.prepare(sql);
    stmt.run(...params);
  }

  /**
   * Set license information
   */
  setLicense(skillId: string, licenseKey: string, expiresAt?: number): void {
    const stmt = this.db.prepare(`
      UPDATE skills SET license_key = ?, license_expires_at = ? WHERE id = ?
    `);
    stmt.run(licenseKey, expiresAt || null, skillId);
  }

  /**
   * Count skills by source
   */
  countBySource(): Record<SkillSource, number> {
    const stmt = this.db.prepare(`
      SELECT source, COUNT(*) as count FROM skills GROUP BY source
    `);
    const rows = stmt.all() as { source: string; count: number }[];

    const result: Record<SkillSource, number> = {
      local: 0,
      marketplace: 0,
      mcp: 0,
    };

    for (const row of rows) {
      result[row.source as SkillSource] = row.count;
    }

    return result;
  }

  /**
   * Get skills with expired licenses
   */
  getExpiredLicenses(): InstalledSkill[] {
    const stmt = this.db.prepare(`
      SELECT * FROM skills
      WHERE license_expires_at IS NOT NULL AND license_expires_at < ?
    `);
    const rows = stmt.all(Date.now()) as SkillRow[];
    return rows.map(row => this.rowToSkill(row));
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Convert database row to InstalledSkill
   */
  private rowToSkill(row: SkillRow): InstalledSkill {
    const metadata: SkillMetadata = {
      id: row.id,
      name: row.name,
      description: row.description || '',
      version: row.version,
      author: row.author || undefined,
      license: row.license,
      tags: JSON.parse(row.tags || '[]'),
      allowedTools: JSON.parse(row.allowed_tools || '[]'),
      requiredTools: JSON.parse(row.required_tools || '[]'),
      permissions: JSON.parse(row.permissions || '[]'),
      trustLevel: row.trust_level as TrustLevel,
      pricing: row.pricing_model ? {
        model: row.pricing_model as 'free' | 'one-time' | 'subscription' | 'usage',
        amount: row.pricing_amount || undefined,
        currency: row.pricing_currency || 'SOL',
        interval: row.pricing_interval as 'daily' | 'weekly' | 'monthly' | undefined,
      } : undefined,
      publisherId: row.publisher_id || undefined,
      publisherName: row.publisher_name || undefined,
      signature: row.signature || undefined,
      installCount: row.install_count,
      rating: row.rating || undefined,
      reviewCount: row.review_count,
      certifications: row.certifications ? JSON.parse(row.certifications) : undefined,
      lastUpdated: row.last_updated || undefined,
    };

    const permissions = this.getPermissions(row.id);

    return {
      id: row.id,
      metadata,
      instructions: row.instructions,
      source: row.source as SkillSource,
      sourcePath: row.source_path,
      installedAt: row.installed_at,
      lastUsedAt: row.last_used_at || undefined,
      enabled: row.enabled === 1,
      autonomyTier: row.autonomy_tier as AutonomyTier,
      grantedPermissions: permissions,
      licenseKey: row.license_key || undefined,
      licenseExpiresAt: row.license_expires_at || undefined,
    };
  }
}

interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  version: string;
  author: string | null;
  license: string;
  tags: string | null;
  allowed_tools: string | null;
  required_tools: string | null;
  permissions: string | null;
  trust_level: string;
  pricing_model: string | null;
  pricing_amount: number | null;
  pricing_currency: string | null;
  pricing_interval: string | null;
  publisher_id: string | null;
  publisher_name: string | null;
  signature: string | null;
  install_count: number;
  rating: number | null;
  review_count: number;
  certifications: string | null;
  instructions: string;
  source: string;
  source_path: string;
  installed_at: number;
  last_updated: number | null;
  last_used_at: number | null;
  enabled: number;
  autonomy_tier: string;
  license_key: string | null;
  license_expires_at: number | null;
}

interface PermissionRow {
  id: number;
  skill_id: string;
  scope: string;
  resource: string | null;
  expires_at: number | null;
  granted_at: number;
  granted_by: string;
}
