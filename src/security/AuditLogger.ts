import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import {
  AuditLogEntry,
  AuditEventType,
} from '../skills/types';

export interface AuditLogConfig {
  dbPath?: string;
  inMemory?: boolean;
  retentionDays?: number;  // How long to keep logs (default: 90)
  maxEntries?: number;     // Max entries to keep (default: 100000)
}

export interface AuditQuery {
  eventTypes?: AuditEventType[];
  skillId?: string;
  executionId?: string;
  outcome?: 'success' | 'failure' | 'pending';
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEntries: number;
  entriesByType: Record<string, number>;
  entriesByOutcome: Record<string, number>;
  oldestEntry?: number;
  newestEntry?: number;
}

export class AuditLogger {
  private db: Database.Database;
  private config: AuditLogConfig;

  constructor(config: AuditLogConfig = {}) {
    this.config = {
      retentionDays: 90,
      maxEntries: 100000,
      ...config,
    };

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
    return path.join(homeDir, '.moltpay', 'audit.db');
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        skill_id TEXT,
        execution_id TEXT,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        outcome TEXT NOT NULL,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_skill_id ON audit_logs(skill_id);
      CREATE INDEX IF NOT EXISTS idx_audit_execution_id ON audit_logs(execution_id);
      CREATE INDEX IF NOT EXISTS idx_audit_outcome ON audit_logs(outcome);
    `);
  }

  /**
   * Log an audit event
   */
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timestamp = Date.now();

    const fullEntry: AuditLogEntry = {
      id,
      timestamp,
      ...entry,
    };

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (
        id, timestamp, event_type, skill_id, execution_id,
        action, details, outcome, error_message
      ) VALUES (
        @id, @timestamp, @eventType, @skillId, @executionId,
        @action, @details, @outcome, @errorMessage
      )
    `);

    stmt.run({
      id,
      timestamp,
      eventType: entry.eventType,
      skillId: entry.skillId || null,
      executionId: entry.executionId || null,
      action: entry.action,
      details: JSON.stringify(entry.details),
      outcome: entry.outcome,
      errorMessage: entry.errorMessage || null,
    });

    // Cleanup old entries if needed
    this.maybeCleanup();

    return fullEntry;
  }

  /**
   * Log skill installation
   */
  logSkillInstalled(skillId: string, source: string, details?: Record<string, unknown>): AuditLogEntry {
    return this.log({
      eventType: 'skill_installed',
      skillId,
      action: `Installed skill from ${source}`,
      details: { source, ...details },
      outcome: 'success',
    });
  }

  /**
   * Log skill uninstallation
   */
  logSkillUninstalled(skillId: string): AuditLogEntry {
    return this.log({
      eventType: 'skill_uninstalled',
      skillId,
      action: 'Uninstalled skill',
      details: {},
      outcome: 'success',
    });
  }

  /**
   * Log skill execution start
   */
  logExecutionStart(skillId: string, executionId: string): AuditLogEntry {
    return this.log({
      eventType: 'skill_executed',
      skillId,
      executionId,
      action: 'Started skill execution',
      details: {},
      outcome: 'pending',
    });
  }

  /**
   * Log skill execution completion
   */
  logExecutionComplete(
    skillId: string,
    executionId: string,
    success: boolean,
    details?: Record<string, unknown>,
    error?: string
  ): AuditLogEntry {
    return this.log({
      eventType: 'skill_executed',
      skillId,
      executionId,
      action: success ? 'Completed skill execution' : 'Failed skill execution',
      details: details || {},
      outcome: success ? 'success' : 'failure',
      errorMessage: error,
    });
  }

  /**
   * Log permission granted
   */
  logPermissionGranted(
    skillId: string,
    scope: string,
    resource?: string,
    grantedBy?: string
  ): AuditLogEntry {
    return this.log({
      eventType: 'permission_granted',
      skillId,
      action: `Granted ${scope} permission`,
      details: { scope, resource, grantedBy },
      outcome: 'success',
    });
  }

  /**
   * Log permission denied
   */
  logPermissionDenied(
    skillId: string,
    scope: string,
    resource?: string,
    reason?: string
  ): AuditLogEntry {
    return this.log({
      eventType: 'permission_denied',
      skillId,
      action: `Denied ${scope} permission`,
      details: { scope, resource, reason },
      outcome: 'failure',
    });
  }

  /**
   * Log payment event
   */
  logPayment(
    skillId: string,
    eventType: 'payment_initiated' | 'payment_completed' | 'payment_failed',
    amount: number,
    currency: string,
    transactionSignature?: string,
    error?: string
  ): AuditLogEntry {
    const outcome = eventType === 'payment_completed' ? 'success' :
                   eventType === 'payment_failed' ? 'failure' : 'pending';

    return this.log({
      eventType,
      skillId,
      action: `Payment ${eventType.split('_')[1]} for ${amount} ${currency}`,
      details: { amount, currency, transactionSignature },
      outcome,
      errorMessage: error,
    });
  }

  /**
   * Log MCP connection event
   */
  logMcpConnection(
    serverId: string,
    connected: boolean,
    error?: string
  ): AuditLogEntry {
    return this.log({
      eventType: connected ? 'mcp_connected' : 'mcp_disconnected',
      action: `${connected ? 'Connected to' : 'Disconnected from'} MCP server ${serverId}`,
      details: { serverId },
      outcome: error ? 'failure' : 'success',
      errorMessage: error,
    });
  }

  /**
   * Log sandbox violation
   */
  logSandboxViolation(
    skillId: string,
    executionId: string,
    violation: string,
    details?: Record<string, unknown>
  ): AuditLogEntry {
    return this.log({
      eventType: 'sandbox_violation',
      skillId,
      executionId,
      action: `Sandbox violation: ${violation}`,
      details: { violation, ...details },
      outcome: 'failure',
    });
  }

  /**
   * Query audit logs
   */
  query(query: AuditQuery): AuditLogEntry[] {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (query.eventTypes && query.eventTypes.length > 0) {
      const placeholders = query.eventTypes.map((_, i) => `@et${i}`).join(', ');
      sql += ` AND event_type IN (${placeholders})`;
      query.eventTypes.forEach((et, i) => {
        params[`et${i}`] = et;
      });
    }

    if (query.skillId) {
      sql += ' AND skill_id = @skillId';
      params.skillId = query.skillId;
    }

    if (query.executionId) {
      sql += ' AND execution_id = @executionId';
      params.executionId = query.executionId;
    }

    if (query.outcome) {
      sql += ' AND outcome = @outcome';
      params.outcome = query.outcome;
    }

    if (query.startTime) {
      sql += ' AND timestamp >= @startTime';
      params.startTime = query.startTime;
    }

    if (query.endTime) {
      sql += ' AND timestamp <= @endTime';
      params.endTime = query.endTime;
    }

    sql += ' ORDER BY timestamp DESC';

    // OFFSET requires LIMIT in SQLite
    if (query.limit || query.offset) {
      sql += ' LIMIT @limit';
      params.limit = query.limit || -1; // -1 means no limit in SQLite
    }

    if (query.offset) {
      sql += ' OFFSET @offset';
      params.offset = query.offset;
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params) as AuditLogRow[];

    return rows.map(row => this.rowToEntry(row));
  }

  /**
   * Get entries for a specific skill
   */
  getBySkill(skillId: string, limit?: number): AuditLogEntry[] {
    return this.query({ skillId, limit });
  }

  /**
   * Get entries for a specific execution
   */
  getByExecution(executionId: string): AuditLogEntry[] {
    return this.query({ executionId });
  }

  /**
   * Get recent entries
   */
  getRecent(limit: number = 100): AuditLogEntry[] {
    return this.query({ limit });
  }

  /**
   * Get audit statistics
   */
  getStats(): AuditStats {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM audit_logs');
    const { count } = totalStmt.get() as { count: number };

    const byTypeStmt = this.db.prepare(`
      SELECT event_type, COUNT(*) as count FROM audit_logs GROUP BY event_type
    `);
    const byType = byTypeStmt.all() as { event_type: string; count: number }[];

    const byOutcomeStmt = this.db.prepare(`
      SELECT outcome, COUNT(*) as count FROM audit_logs GROUP BY outcome
    `);
    const byOutcome = byOutcomeStmt.all() as { outcome: string; count: number }[];

    const rangeStmt = this.db.prepare(`
      SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM audit_logs
    `);
    const { oldest, newest } = rangeStmt.get() as { oldest: number | null; newest: number | null };

    return {
      totalEntries: count,
      entriesByType: Object.fromEntries(byType.map(r => [r.event_type, r.count])),
      entriesByOutcome: Object.fromEntries(byOutcome.map(r => [r.outcome, r.count])),
      oldestEntry: oldest || undefined,
      newestEntry: newest || undefined,
    };
  }

  /**
   * Export logs to JSON
   */
  export(query?: AuditQuery): string {
    const entries = this.query(query || { limit: this.config.maxEntries });
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.db.exec('DELETE FROM audit_logs');
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Clean up old entries based on retention policy
   */
  private maybeCleanup(): void {
    // Only run cleanup occasionally (every ~100 inserts)
    if (Math.random() > 0.01) return;

    const now = Date.now();
    const retentionMs = (this.config.retentionDays || 90) * 24 * 60 * 60 * 1000;
    const cutoff = now - retentionMs;

    // Delete old entries
    const deleteStmt = this.db.prepare('DELETE FROM audit_logs WHERE timestamp < ?');
    deleteStmt.run(cutoff);

    // Trim to max entries
    const maxEntries = this.config.maxEntries || 100000;
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM audit_logs');
    const { count } = countStmt.get() as { count: number };

    if (count > maxEntries) {
      const trimStmt = this.db.prepare(`
        DELETE FROM audit_logs WHERE id IN (
          SELECT id FROM audit_logs ORDER BY timestamp ASC LIMIT ?
        )
      `);
      trimStmt.run(count - maxEntries);
    }
  }

  /**
   * Convert database row to AuditLogEntry
   */
  private rowToEntry(row: AuditLogRow): AuditLogEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type as AuditEventType,
      skillId: row.skill_id || undefined,
      executionId: row.execution_id || undefined,
      action: row.action,
      details: JSON.parse(row.details),
      outcome: row.outcome as AuditLogEntry['outcome'],
      errorMessage: row.error_message || undefined,
    };
  }
}

interface AuditLogRow {
  id: string;
  timestamp: number;
  event_type: string;
  skill_id: string | null;
  execution_id: string | null;
  action: string;
  details: string;
  outcome: string;
  error_message: string | null;
}
