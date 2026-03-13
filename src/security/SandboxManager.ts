import * as vm from 'vm';
import {
  Permission,
  PermissionScope,
  SandboxError,
} from '../skills/types';

export interface SandboxConfig {
  memoryLimit?: number;      // Memory limit in MB (default: 128)
  timeout?: number;          // Execution timeout in ms (default: 30000)
  allowedGlobals?: string[]; // Allowed global objects
  useStrictSandbox?: boolean; // If true, uses more restrictive sandbox (requires isolated-vm)
}

export interface SandboxContext {
  skillId: string;
  permissions: Permission[];
  config: SandboxConfig;
}

export interface SandboxResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  executionTime: number;
  memoryUsed?: number;
}

const DEFAULT_CONFIG: SandboxConfig = {
  memoryLimit: 128,
  timeout: 30000,
  allowedGlobals: ['console', 'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Promise'],
  useStrictSandbox: false,
};

/**
 * SandboxManager provides isolated execution environments for untrusted code.
 *
 * This implementation uses Node.js's built-in vm module for sandboxing.
 * For production use with untrusted code, consider:
 * - Docker containers for Python/Bash scripts
 * - Firecracker microVMs for maximum isolation
 * - WebAssembly for portable sandboxing
 */
export class SandboxManager {
  private contexts: Map<string, SandboxContext> = new Map();
  private vmContexts: Map<string, vm.Context> = new Map();

  constructor() {}

  /**
   * Create a new sandbox for a skill
   */
  async createSandbox(
    skillId: string,
    permissions: Permission[],
    config: SandboxConfig = {}
  ): Promise<void> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    this.contexts.set(skillId, {
      skillId,
      permissions,
      config: mergedConfig,
    });

    // Create VM context with restricted globals
    const sandbox = this.createSandboxObject(permissions, mergedConfig);
    const context = vm.createContext(sandbox);
    this.vmContexts.set(skillId, context);
  }

  /**
   * Execute code in sandbox
   */
  async execute<T = unknown>(
    skillId: string,
    code: string,
    globals?: Record<string, unknown>
  ): Promise<SandboxResult<T>> {
    const startTime = Date.now();
    const sandboxContext = this.contexts.get(skillId);
    const vmContext = this.vmContexts.get(skillId);

    if (!sandboxContext || !vmContext) {
      throw new SandboxError(`Sandbox not found for skill: ${skillId}`);
    }

    // Validate code before execution
    const validation = this.validateCode(code);
    if (!validation.valid) {
      return {
        success: false,
        error: `Code validation failed: ${validation.issues.join(', ')}`,
        executionTime: Date.now() - startTime,
      };
    }

    try {
      // Add custom globals to context
      if (globals) {
        for (const [key, value] of Object.entries(globals)) {
          vmContext[key] = value;
        }
      }

      // Execute with timeout
      const script = new vm.Script(code, {
        filename: `skill-${skillId}.js`,
      });

      const result = script.runInContext(vmContext, {
        timeout: sandboxContext.config.timeout,
        displayErrors: true,
      });

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result: result as T,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof Error) {
        if (error.message.includes('Script execution timed out')) {
          return {
            success: false,
            error: 'Execution timed out',
            executionTime,
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
      };
    }
  }

  /**
   * Execute a function in sandbox
   */
  async executeFunction<T = unknown, A extends unknown[] = unknown[]>(
    skillId: string,
    fn: (...args: A) => T | Promise<T>,
    args: A = [] as unknown as A
  ): Promise<SandboxResult<T>> {
    // Convert function to code string
    const code = `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`;
    return this.execute<T>(skillId, code);
  }

  /**
   * Run code with callback support
   */
  async executeWithCallbacks<T = unknown>(
    skillId: string,
    code: string,
    callbacks: Record<string, (...args: unknown[]) => unknown>
  ): Promise<SandboxResult<T>> {
    const sandboxContext = this.contexts.get(skillId);
    const vmContext = this.vmContexts.get(skillId);

    if (!sandboxContext || !vmContext) {
      throw new SandboxError(`Sandbox not found for skill: ${skillId}`);
    }

    const startTime = Date.now();

    try {
      // Add callbacks to context
      for (const [name, callback] of Object.entries(callbacks)) {
        vmContext[name] = callback;
      }

      const script = new vm.Script(code, {
        filename: `skill-${skillId}.js`,
      });

      const result = script.runInContext(vmContext, {
        timeout: sandboxContext.config.timeout,
        displayErrors: true,
      });

      return {
        success: true,
        result: result as T,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if sandbox exists for skill
   */
  hasSandbox(skillId: string): boolean {
    return this.contexts.has(skillId);
  }

  /**
   * Get sandbox memory usage (estimated)
   */
  getMemoryUsage(skillId: string): number | null {
    if (!this.contexts.has(skillId)) return null;
    // VM module doesn't provide memory stats, return estimate
    return 0;
  }

  /**
   * Destroy a sandbox
   */
  destroySandbox(skillId: string): void {
    this.contexts.delete(skillId);
    this.vmContexts.delete(skillId);
  }

  /**
   * Destroy all sandboxes
   */
  destroyAll(): void {
    this.contexts.clear();
    this.vmContexts.clear();
  }

  /**
   * Create sandbox object with limited globals
   */
  private createSandboxObject(
    permissions: Permission[],
    config: SandboxConfig
  ): Record<string, unknown> {
    const logs: string[] = [];

    const sandbox: Record<string, unknown> = {
      // Safe console
      console: {
        log: (...args: unknown[]) => {
          logs.push(args.map(a => String(a)).join(' '));
        },
        warn: (...args: unknown[]) => {
          logs.push('[WARN] ' + args.map(a => String(a)).join(' '));
        },
        error: (...args: unknown[]) => {
          logs.push('[ERROR] ' + args.map(a => String(a)).join(' '));
        },
        info: (...args: unknown[]) => {
          logs.push('[INFO] ' + args.map(a => String(a)).join(' '));
        },
      },
      __logs: logs,

      // Safe built-ins
      JSON: {
        parse: JSON.parse,
        stringify: JSON.stringify,
      },
      Math: { ...Math },
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURI,
      decodeURI,
      encodeURIComponent,
      decodeURIComponent,

      // Constructors
      Array,
      Object,
      String,
      Number,
      Boolean,
      Date,
      Map,
      Set,
      Promise,
      Error,
      TypeError,
      RangeError,
    };

    // Add permission-gated APIs
    const hasPermission = (scope: PermissionScope): boolean => {
      const now = Date.now();
      return permissions.some(p =>
        p.scope === scope && (!p.expiresAt || p.expiresAt > now)
      );
    };

    // Network fetch (if permitted)
    if (hasPermission('network_fetch')) {
      sandbox.__fetch = async (url: string, options?: RequestInit) => {
        const response = await fetch(url, options);
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          text,
        };
      };
    }

    return sandbox;
  }

  /**
   * Validate code before execution
   */
  validateCode(code: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /process\./g, message: 'Access to process object is not allowed' },
      { pattern: /require\s*\(/g, message: 'require() is not allowed' },
      { pattern: /import\s*\(/g, message: 'Dynamic import is not allowed' },
      { pattern: /eval\s*\(/g, message: 'eval() is not allowed' },
      { pattern: /Function\s*\(/g, message: 'Function constructor is not allowed' },
      { pattern: /\.__proto__/g, message: 'Prototype manipulation is not allowed' },
      { pattern: /\.constructor\s*\(/g, message: 'Constructor access is not allowed' },
      { pattern: /global\./g, message: 'Access to global object is not allowed' },
      { pattern: /globalThis/g, message: 'Access to globalThis is not allowed' },
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(code)) {
        issues.push(message);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
