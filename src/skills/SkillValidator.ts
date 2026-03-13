import matter from 'gray-matter';
import { z } from 'zod';
import {
  SkillFrontmatterSchema,
  ParsedSkill,
  SkillMetadata,
  PermissionScope,
  TrustLevel,
  SkillParseError,
  SkillValidationError,
} from './types';

const VALID_PERMISSION_SCOPES: PermissionScope[] = [
  'file_read',
  'file_write',
  'network_fetch',
  'network_connect',
  'wallet_read',
  'wallet_sign',
  'wallet_send',
  'system_exec',
];

const VALID_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
];

export class SkillValidator {
  /**
   * Parse a SKILL.md file content into structured data
   */
  parseSkillContent(content: string): ParsedSkill {
    try {
      const { data, content: instructions } = matter(content);

      // Validate frontmatter against schema
      const parseResult = SkillFrontmatterSchema.safeParse(data);

      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(e =>
          `${e.path.join('.')}: ${e.message}`
        ).join(', ');
        throw new SkillParseError(`Invalid SKILL.md frontmatter: ${errors}`, {
          zodErrors: parseResult.error.errors,
        });
      }

      return {
        frontmatter: parseResult.data,
        instructions: instructions.trim(),
        rawContent: content,
      };
    } catch (error) {
      if (error instanceof SkillParseError) {
        throw error;
      }
      throw new SkillParseError(
        `Failed to parse SKILL.md: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
  }

  /**
   * Convert parsed skill to full metadata
   */
  toMetadata(parsed: ParsedSkill, id: string): SkillMetadata {
    const { frontmatter } = parsed;

    // Parse allowed-tools string into array
    const allowedTools = frontmatter['allowed-tools']
      ? frontmatter['allowed-tools'].split(/\s+/).filter(Boolean)
      : [];

    const requiredTools = frontmatter['required-tools']
      ? frontmatter['required-tools'].split(/\s+/).filter(Boolean)
      : [];

    // Parse permissions
    const permissions = this.parsePermissions(frontmatter.permissions || []);

    return {
      id,
      name: frontmatter.name,
      description: frontmatter.description,
      version: frontmatter.version || '1.0.0',
      author: frontmatter.author,
      license: frontmatter.license || 'MIT',
      tags: frontmatter.tags || [],
      allowedTools,
      requiredTools,
      permissions,
      trustLevel: (frontmatter['trust-level'] as TrustLevel) || 'untrusted',
      pricing: frontmatter.pricing ? {
        model: frontmatter.pricing.model,
        amount: frontmatter.pricing.amount,
        currency: frontmatter.pricing.currency || 'SOL',
        interval: frontmatter.pricing.interval,
      } : undefined,
    };
  }

  /**
   * Validate a parsed skill for security and correctness
   */
  validate(parsed: ParsedSkill): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate instructions exist and have content
    if (!parsed.instructions || parsed.instructions.length < 10) {
      errors.push('Skill instructions are too short or missing');
    }

    // Validate tools
    const allowedTools = parsed.frontmatter['allowed-tools']
      ? parsed.frontmatter['allowed-tools'].split(/\s+/).filter(Boolean)
      : [];

    for (const tool of allowedTools) {
      if (!VALID_TOOLS.includes(tool)) {
        warnings.push(`Unknown tool: ${tool}`);
      }
    }

    // Check for dangerous tool combinations
    if (allowedTools.includes('Bash') && allowedTools.includes('Write')) {
      warnings.push('Skill has both Bash and Write access - high risk');
    }

    // Validate permissions
    const permissions = parsed.frontmatter.permissions || [];
    for (const perm of permissions) {
      if (!this.isValidPermission(perm)) {
        errors.push(`Invalid permission: ${perm}`);
      }
    }

    // Check for sensitive permissions without trust level
    const sensitivePerms = ['wallet_sign', 'wallet_send', 'system_exec'];
    const hasSensitive = permissions.some(p =>
      sensitivePerms.some(sp => p.startsWith(sp))
    );

    if (hasSensitive && !parsed.frontmatter['trust-level']) {
      warnings.push('Skill requests sensitive permissions but has no trust-level specified');
    }

    // Validate pricing if present
    if (parsed.frontmatter.pricing) {
      const { model, amount } = parsed.frontmatter.pricing;
      if (model !== 'free' && (amount === undefined || amount <= 0)) {
        errors.push('Paid skills must have a positive amount');
      }
      if (model === 'subscription' && !parsed.frontmatter.pricing.interval) {
        errors.push('Subscription skills must specify an interval');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Parse permission strings into PermissionScope array
   */
  private parsePermissions(permissions: string[]): PermissionScope[] {
    const result: PermissionScope[] = [];

    for (const perm of permissions) {
      // Handle permission with resource (e.g., "file_read:/path/*")
      const [scope] = perm.split(':');

      if (VALID_PERMISSION_SCOPES.includes(scope as PermissionScope)) {
        if (!result.includes(scope as PermissionScope)) {
          result.push(scope as PermissionScope);
        }
      }
    }

    return result;
  }

  /**
   * Check if a permission string is valid
   */
  private isValidPermission(permission: string): boolean {
    const [scope, resource] = permission.split(':');

    if (!VALID_PERMISSION_SCOPES.includes(scope as PermissionScope)) {
      return false;
    }

    // Validate resource patterns if present
    if (resource) {
      // File paths should be absolute or use wildcards
      if (scope.startsWith('file_')) {
        if (!resource.startsWith('/') && !resource.startsWith('~') && !resource.includes('*')) {
          return false;
        }
      }

      // Network resources should be valid hosts
      if (scope.startsWith('network_')) {
        try {
          // Allow wildcards and basic host patterns
          if (!resource.includes('*') && !resource.match(/^[a-zA-Z0-9.-]+$/)) {
            return false;
          }
        } catch {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Generate a deterministic skill ID from content
   */
  generateSkillId(name: string, author?: string): string {
    const base = author ? `${author}/${name}` : name;
    return base
      .toLowerCase()
      .replace(/[^a-z0-9-/]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Check if skill instructions contain potentially dangerous patterns
   */
  checkSecurityPatterns(instructions: string): SecurityCheck {
    const issues: SecurityIssue[] = [];

    // Check for private key patterns
    if (/private.?key|secret.?key|seed.?phrase|mnemonic/i.test(instructions)) {
      issues.push({
        severity: 'high',
        pattern: 'private_key_reference',
        message: 'Instructions reference private keys or seed phrases',
      });
    }

    // Check for curl/wget to unknown hosts
    const curlMatch = instructions.match(/curl|wget\s+["']?https?:\/\/([^\/\s"']+)/gi);
    if (curlMatch) {
      issues.push({
        severity: 'medium',
        pattern: 'external_download',
        message: 'Instructions contain external download commands',
      });
    }

    // Check for eval/exec patterns
    if (/\beval\s*\(|\bexec\s*\(|\bFunction\s*\(/i.test(instructions)) {
      issues.push({
        severity: 'high',
        pattern: 'code_execution',
        message: 'Instructions contain dynamic code execution patterns',
      });
    }

    // Check for environment variable access
    if (/\$\{?[A-Z_]+\}?|process\.env|os\.environ/i.test(instructions)) {
      issues.push({
        severity: 'low',
        pattern: 'env_access',
        message: 'Instructions may access environment variables',
      });
    }

    return {
      safe: issues.filter(i => i.severity === 'high').length === 0,
      issues,
    };
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SecurityCheck {
  safe: boolean;
  issues: SecurityIssue[];
}

export interface SecurityIssue {
  severity: 'low' | 'medium' | 'high';
  pattern: string;
  message: string;
}
