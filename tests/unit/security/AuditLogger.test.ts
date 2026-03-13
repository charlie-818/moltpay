import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogger } from '../../../src/security/AuditLogger';

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger({ inMemory: true });
  });

  afterEach(() => {
    auditLogger.close();
  });

  describe('log', () => {
    it('should log audit event', () => {
      const entry = auditLogger.log({
        eventType: 'skill_installed',
        skillId: 'test-skill',
        action: 'Installed skill',
        details: { source: 'local' },
        outcome: 'success',
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.eventType).toBe('skill_installed');
    });

    it('should generate unique IDs', () => {
      const entry1 = auditLogger.log({
        eventType: 'skill_installed',
        action: 'Install 1',
        details: {},
        outcome: 'success',
      });

      const entry2 = auditLogger.log({
        eventType: 'skill_installed',
        action: 'Install 2',
        details: {},
        outcome: 'success',
      });

      expect(entry1.id).not.toBe(entry2.id);
    });

    it('should store optional fields', () => {
      const entry = auditLogger.log({
        eventType: 'skill_executed',
        skillId: 'test-skill',
        executionId: 'exec-123',
        action: 'Execute',
        details: {},
        outcome: 'failure',
        errorMessage: 'Test error',
      });

      expect(entry.skillId).toBe('test-skill');
      expect(entry.executionId).toBe('exec-123');
      expect(entry.errorMessage).toBe('Test error');
    });
  });

  describe('logSkillInstalled', () => {
    it('should log skill installation', () => {
      const entry = auditLogger.logSkillInstalled('test-skill', 'local');

      expect(entry.eventType).toBe('skill_installed');
      expect(entry.skillId).toBe('test-skill');
      expect(entry.outcome).toBe('success');
    });

    it('should include source in details', () => {
      const entry = auditLogger.logSkillInstalled('test-skill', 'marketplace', {
        version: '1.0.0',
      });

      expect(entry.details.source).toBe('marketplace');
      expect(entry.details.version).toBe('1.0.0');
    });
  });

  describe('logSkillUninstalled', () => {
    it('should log skill uninstallation', () => {
      const entry = auditLogger.logSkillUninstalled('test-skill');

      expect(entry.eventType).toBe('skill_uninstalled');
      expect(entry.skillId).toBe('test-skill');
    });
  });

  describe('logExecutionStart', () => {
    it('should log execution start', () => {
      const entry = auditLogger.logExecutionStart('test-skill', 'exec-123');

      expect(entry.eventType).toBe('skill_executed');
      expect(entry.executionId).toBe('exec-123');
      expect(entry.outcome).toBe('pending');
    });
  });

  describe('logExecutionComplete', () => {
    it('should log successful execution', () => {
      const entry = auditLogger.logExecutionComplete(
        'test-skill',
        'exec-123',
        true,
        { result: 'ok' }
      );

      expect(entry.eventType).toBe('skill_executed');
      expect(entry.outcome).toBe('success');
    });

    it('should log failed execution', () => {
      const entry = auditLogger.logExecutionComplete(
        'test-skill',
        'exec-123',
        false,
        {},
        'Error occurred'
      );

      expect(entry.outcome).toBe('failure');
      expect(entry.errorMessage).toBe('Error occurred');
    });
  });

  describe('logPermissionGranted', () => {
    it('should log permission grant', () => {
      const entry = auditLogger.logPermissionGranted(
        'test-skill',
        'file_read',
        '/tmp/*',
        'user'
      );

      expect(entry.eventType).toBe('permission_granted');
      expect(entry.details.scope).toBe('file_read');
      expect(entry.details.resource).toBe('/tmp/*');
    });
  });

  describe('logPermissionDenied', () => {
    it('should log permission denial', () => {
      const entry = auditLogger.logPermissionDenied(
        'test-skill',
        'wallet_send',
        undefined,
        'User declined'
      );

      expect(entry.eventType).toBe('permission_denied');
      expect(entry.outcome).toBe('failure');
      expect(entry.details.reason).toBe('User declined');
    });
  });

  describe('logPayment', () => {
    it('should log payment initiation', () => {
      const entry = auditLogger.logPayment(
        'test-skill',
        'payment_initiated',
        0.1,
        'SOL'
      );

      expect(entry.eventType).toBe('payment_initiated');
      expect(entry.outcome).toBe('pending');
      expect(entry.details.amount).toBe(0.1);
    });

    it('should log payment completion', () => {
      const entry = auditLogger.logPayment(
        'test-skill',
        'payment_completed',
        0.1,
        'SOL',
        'tx-signature-123'
      );

      expect(entry.eventType).toBe('payment_completed');
      expect(entry.outcome).toBe('success');
      expect(entry.details.transactionSignature).toBe('tx-signature-123');
    });

    it('should log payment failure', () => {
      const entry = auditLogger.logPayment(
        'test-skill',
        'payment_failed',
        0.1,
        'SOL',
        undefined,
        'Insufficient funds'
      );

      expect(entry.eventType).toBe('payment_failed');
      expect(entry.outcome).toBe('failure');
      expect(entry.errorMessage).toBe('Insufficient funds');
    });
  });

  describe('logMcpConnection', () => {
    it('should log MCP connection', () => {
      const entry = auditLogger.logMcpConnection('test-server', true);

      expect(entry.eventType).toBe('mcp_connected');
      expect(entry.outcome).toBe('success');
    });

    it('should log MCP disconnection', () => {
      const entry = auditLogger.logMcpConnection('test-server', false);

      expect(entry.eventType).toBe('mcp_disconnected');
      expect(entry.outcome).toBe('success');
    });

    it('should log connection error', () => {
      const entry = auditLogger.logMcpConnection(
        'test-server',
        false,
        'Connection refused'
      );

      expect(entry.outcome).toBe('failure');
      expect(entry.errorMessage).toBe('Connection refused');
    });
  });

  describe('logSandboxViolation', () => {
    it('should log sandbox violation', () => {
      const entry = auditLogger.logSandboxViolation(
        'test-skill',
        'exec-123',
        'Attempted process access',
        { code: 'process.exit(1)' }
      );

      expect(entry.eventType).toBe('sandbox_violation');
      expect(entry.outcome).toBe('failure');
      expect(entry.details.violation).toBe('Attempted process access');
    });
  });

  describe('query', () => {
    beforeEach(() => {
      // Add test data
      auditLogger.logSkillInstalled('skill-1', 'local');
      auditLogger.logSkillInstalled('skill-2', 'marketplace');
      auditLogger.logExecutionStart('skill-1', 'exec-1');
      auditLogger.logExecutionComplete('skill-1', 'exec-1', true);
      auditLogger.logPermissionGranted('skill-1', 'file_read');
    });

    it('should query all logs', () => {
      const results = auditLogger.query({});
      expect(results.length).toBeGreaterThanOrEqual(5);
    });

    it('should filter by event type', () => {
      const results = auditLogger.query({
        eventTypes: ['skill_installed'],
      });

      expect(results.every(r => r.eventType === 'skill_installed')).toBe(true);
    });

    it('should filter by skill ID', () => {
      const results = auditLogger.query({ skillId: 'skill-1' });

      expect(results.every(r => r.skillId === 'skill-1')).toBe(true);
    });

    it('should filter by execution ID', () => {
      const results = auditLogger.query({ executionId: 'exec-1' });

      expect(results.every(r => r.executionId === 'exec-1')).toBe(true);
    });

    it('should filter by outcome', () => {
      const results = auditLogger.query({ outcome: 'success' });

      expect(results.every(r => r.outcome === 'success')).toBe(true);
    });

    it('should filter by time range', () => {
      const now = Date.now();
      const results = auditLogger.query({
        startTime: now - 10000,
        endTime: now + 10000,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should apply limit', () => {
      const results = auditLogger.query({ limit: 2 });

      expect(results).toHaveLength(2);
    });

    it('should apply offset', () => {
      const all = auditLogger.query({});
      const offset = auditLogger.query({ offset: 2 });

      expect(offset).toHaveLength(all.length - 2);
    });

    it('should combine multiple filters', () => {
      const results = auditLogger.query({
        eventTypes: ['skill_executed'],
        outcome: 'success',
      });

      expect(
        results.every(
          r => r.eventType === 'skill_executed' && r.outcome === 'success'
        )
      ).toBe(true);
    });

    it('should return in descending timestamp order', () => {
      const results = auditLogger.query({});

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].timestamp).toBeGreaterThanOrEqual(results[i].timestamp);
      }
    });
  });

  describe('getBySkill', () => {
    it('should get logs for specific skill', () => {
      auditLogger.logSkillInstalled('target-skill', 'local');
      auditLogger.logSkillInstalled('other-skill', 'local');

      const results = auditLogger.getBySkill('target-skill');

      expect(results.every(r => r.skillId === 'target-skill')).toBe(true);
    });

    it('should respect limit', () => {
      auditLogger.logSkillInstalled('skill', 'local');
      auditLogger.logExecutionStart('skill', 'exec-1');
      auditLogger.logExecutionComplete('skill', 'exec-1', true);

      const results = auditLogger.getBySkill('skill', 2);

      expect(results).toHaveLength(2);
    });
  });

  describe('getByExecution', () => {
    it('should get logs for specific execution', () => {
      auditLogger.logExecutionStart('skill', 'target-exec');
      auditLogger.logExecutionStart('skill', 'other-exec');

      const results = auditLogger.getByExecution('target-exec');

      expect(results.every(r => r.executionId === 'target-exec')).toBe(true);
    });
  });

  describe('getRecent', () => {
    it('should get recent logs', () => {
      for (let i = 0; i < 10; i++) {
        auditLogger.logSkillInstalled(`skill-${i}`, 'local');
      }

      const results = auditLogger.getRecent(5);

      expect(results).toHaveLength(5);
    });

    it('should default to 100 entries', () => {
      const results = auditLogger.getRecent();

      expect(results.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      auditLogger.logSkillInstalled('skill-1', 'local');
      auditLogger.logExecutionStart('skill-1', 'exec-1');
      auditLogger.logExecutionComplete('skill-1', 'exec-1', true);
      auditLogger.logExecutionComplete('skill-2', 'exec-2', false, {}, 'Error');
    });

    it('should return total entries', () => {
      const stats = auditLogger.getStats();
      expect(stats.totalEntries).toBeGreaterThan(0);
    });

    it('should count by event type', () => {
      const stats = auditLogger.getStats();

      expect(stats.entriesByType['skill_installed']).toBe(1);
      expect(stats.entriesByType['skill_executed']).toBeGreaterThanOrEqual(1);
    });

    it('should count by outcome', () => {
      const stats = auditLogger.getStats();

      expect(stats.entriesByOutcome['success']).toBeGreaterThan(0);
    });

    it('should include timestamp range', () => {
      const stats = auditLogger.getStats();

      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
      expect(stats.newestEntry).toBeGreaterThanOrEqual(stats.oldestEntry!);
    });
  });

  describe('export', () => {
    it('should export logs as JSON', () => {
      auditLogger.logSkillInstalled('skill-1', 'local');

      const exported = auditLogger.export();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('should export with query filters', () => {
      auditLogger.logSkillInstalled('skill-1', 'local');
      auditLogger.logSkillInstalled('skill-2', 'marketplace');

      const exported = auditLogger.export({ skillId: 'skill-1' });
      const parsed = JSON.parse(exported);

      expect(parsed.every((e: any) => e.skillId === 'skill-1')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all logs', () => {
      auditLogger.logSkillInstalled('skill-1', 'local');
      auditLogger.logSkillInstalled('skill-2', 'local');

      auditLogger.clear();

      const results = auditLogger.query({});
      expect(results).toHaveLength(0);
    });
  });

  describe('retention', () => {
    it('should respect retention config', () => {
      const logger = new AuditLogger({
        inMemory: true,
        retentionDays: 90,
        maxEntries: 1000,
      });

      // Just verify it creates without error
      expect(logger).toBeDefined();
      logger.close();
    });
  });
});
