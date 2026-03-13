import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SandboxManager } from '../../../src/security/SandboxManager';
import { createMockPermission } from '../../fixtures/skills';

describe('SandboxManager', () => {
  let sandboxManager: SandboxManager;

  beforeEach(() => {
    sandboxManager = new SandboxManager();
  });

  afterEach(() => {
    sandboxManager.destroyAll();
  });

  describe('createSandbox', () => {
    it('should create sandbox for skill', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      expect(sandboxManager.hasSandbox('test-skill')).toBe(true);
    });

    it('should accept custom config', async () => {
      await sandboxManager.createSandbox('test-skill', [], {
        timeout: 5000,
        memoryLimit: 64,
      });

      expect(sandboxManager.hasSandbox('test-skill')).toBe(true);
    });
  });

  describe('hasSandbox', () => {
    it('should return true for existing sandbox', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      expect(sandboxManager.hasSandbox('test-skill')).toBe(true);
    });

    it('should return false for non-existing sandbox', () => {
      expect(sandboxManager.hasSandbox('unknown')).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute safe code', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute<number>(
        'test-skill',
        '1 + 2 + 3'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(6);
    });

    it('should return result from expression', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute<string>(
        'test-skill',
        '"hello" + " " + "world"'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('hello world');
    });

    it('should execute array operations', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute<number[]>(
        'test-skill',
        '[1, 2, 3].map(x => x * 2)'
      );

      expect(result.success).toBe(true);
      expect(result.result).toEqual([2, 4, 6]);
    });

    it('should execute object operations', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute<{ sum: number }>(
        'test-skill',
        '({ sum: 1 + 2 })'
      );

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ sum: 3 });
    });

    it('should have access to JSON', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute<object>(
        'test-skill',
        'JSON.parse(\'{"key": "value"}\')'
      );

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ key: 'value' });
    });

    it('should have access to Math', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute<number>(
        'test-skill',
        'Math.max(1, 2, 3)'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(3);
    });

    it('should throw for non-existent sandbox', async () => {
      await expect(
        sandboxManager.execute('unknown', '1 + 1')
      ).rejects.toThrow('Sandbox not found');
    });

    it('should return execution time', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute(
        'test-skill',
        '1 + 1'
      );

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors in sandboxed code', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute(
        'test-skill',
        'throw new Error("Test error")'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });

    it('should accept custom globals', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute<number>(
        'test-skill',
        'customValue * 2',
        { customValue: 21 }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });
  });

  describe('validateCode', () => {
    it('should pass safe code', () => {
      const result = sandboxManager.validateCode('const x = 1 + 2;');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should block process access', () => {
      const result = sandboxManager.validateCode('process.exit(1)');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('process'))).toBe(true);
    });

    it('should block require', () => {
      const result = sandboxManager.validateCode('require("fs")');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('require'))).toBe(true);
    });

    it('should block dynamic import', () => {
      const result = sandboxManager.validateCode('import("fs")');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('import'))).toBe(true);
    });

    it('should block eval', () => {
      const result = sandboxManager.validateCode('eval("code")');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('eval'))).toBe(true);
    });

    it('should block Function constructor', () => {
      const result = sandboxManager.validateCode('new Function("return 1")');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('Function'))).toBe(true);
    });

    it('should block __proto__ access', () => {
      const result = sandboxManager.validateCode('obj.__proto__');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('proto'))).toBe(true);
    });

    it('should block constructor access', () => {
      const result = sandboxManager.validateCode('obj.constructor()');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('constructor'))).toBe(true);
    });

    it('should block global access', () => {
      const result = sandboxManager.validateCode('global.process');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('global'))).toBe(true);
    });

    it('should block globalThis access', () => {
      const result = sandboxManager.validateCode('globalThis.process');

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('globalThis'))).toBe(true);
    });

    it('should collect multiple issues', () => {
      const result = sandboxManager.validateCode(`
        process.exit(1);
        require("fs");
        eval("code");
      `);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(1);
    });
  });

  describe('execute with code validation', () => {
    it('should reject dangerous code before execution', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute(
        'test-skill',
        'process.exit(1)'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should reject code with require', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute(
        'test-skill',
        'const fs = require("fs")'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });
  });

  describe('executeFunction', () => {
    it('should execute function', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const fn = (a: number, b: number) => a + b;
      const result = await sandboxManager.executeFunction<number>(
        'test-skill',
        fn,
        [2, 3]
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(5);
    });

    it('should execute function with no args', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const fn = () => 'hello';
      const result = await sandboxManager.executeFunction<string>(
        'test-skill',
        fn
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('hello');
    });
  });

  describe('executeWithCallbacks', () => {
    it('should provide callbacks to sandbox', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.executeWithCallbacks<number>(
        'test-skill',
        'myCallback(5)',
        { myCallback: (n: number) => n * 2 }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(10);
    });

    it('should handle errors in callbacks', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.executeWithCallbacks(
        'test-skill',
        'badCallback()',
        { badCallback: () => { throw new Error('Callback error'); } }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Callback error');
    });
  });

  describe('destroySandbox', () => {
    it('should destroy sandbox', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      sandboxManager.destroySandbox('test-skill');

      expect(sandboxManager.hasSandbox('test-skill')).toBe(false);
    });

    it('should not throw for non-existent sandbox', () => {
      expect(() =>
        sandboxManager.destroySandbox('unknown')
      ).not.toThrow();
    });
  });

  describe('destroyAll', () => {
    it('should destroy all sandboxes', async () => {
      await sandboxManager.createSandbox('skill-1', []);
      await sandboxManager.createSandbox('skill-2', []);
      await sandboxManager.createSandbox('skill-3', []);

      sandboxManager.destroyAll();

      expect(sandboxManager.hasSandbox('skill-1')).toBe(false);
      expect(sandboxManager.hasSandbox('skill-2')).toBe(false);
      expect(sandboxManager.hasSandbox('skill-3')).toBe(false);
    });
  });

  describe('getMemoryUsage', () => {
    it('should return 0 for existing sandbox', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const usage = sandboxManager.getMemoryUsage('test-skill');

      // Node.js VM doesn't provide memory stats, so returns 0
      expect(usage).toBe(0);
    });

    it('should return null for non-existent sandbox', () => {
      const usage = sandboxManager.getMemoryUsage('unknown');

      expect(usage).toBeNull();
    });
  });

  describe('console in sandbox', () => {
    it('should capture console.log', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute(
        'test-skill',
        `
        console.log("Hello");
        console.log("World");
        __logs.join(", ");
        `
      );

      expect(result.success).toBe(true);
      expect(result.result).toContain('Hello');
      expect(result.result).toContain('World');
    });

    it('should capture console.warn', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute(
        'test-skill',
        `
        console.warn("Warning!");
        __logs[0];
        `
      );

      expect(result.success).toBe(true);
      expect(result.result).toContain('[WARN]');
    });

    it('should capture console.error', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute(
        'test-skill',
        `
        console.error("Error!");
        __logs[0];
        `
      );

      expect(result.success).toBe(true);
      expect(result.result).toContain('[ERROR]');
    });
  });

  describe('permission-gated APIs', () => {
    it('should not expose fetch without network_fetch permission', async () => {
      await sandboxManager.createSandbox('test-skill', []);

      const result = await sandboxManager.execute(
        'test-skill',
        'typeof __fetch'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('undefined');
    });

    it('should expose fetch with network_fetch permission', async () => {
      await sandboxManager.createSandbox('test-skill', [
        createMockPermission('network_fetch'),
      ]);

      const result = await sandboxManager.execute(
        'test-skill',
        'typeof __fetch'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('function');
    });
  });
});
