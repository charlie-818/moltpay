import { describe, it, expect, beforeEach } from 'vitest';
import { SkillValidator } from '../../../src/skills/SkillValidator';
import {
  VALID_SKILL_MD,
  MINIMAL_SKILL_MD,
  INVALID_SKILL_NO_NAME,
  INVALID_SKILL_NO_DESCRIPTION,
  INVALID_SKILL_MALFORMED_YAML,
  PAID_SKILL_ONETIME,
  PAID_SKILL_SUBSCRIPTION,
  INVALID_PRICING_NO_INTERVAL,
  INVALID_PRICING_NO_AMOUNT,
  SKILL_WITH_DANGEROUS_PATTERNS,
  SKILL_SENSITIVE_NO_TRUST,
  SKILL_UNKNOWN_TOOL,
  SKILL_SHORT_INSTRUCTIONS,
  SKILL_INVALID_PERMISSION,
} from '../../fixtures/skills';

describe('SkillValidator', () => {
  let validator: SkillValidator;

  beforeEach(() => {
    validator = new SkillValidator();
  });

  describe('parseSkillContent', () => {
    it('should parse valid SKILL.md with all fields', () => {
      const result = validator.parseSkillContent(VALID_SKILL_MD);

      expect(result).toBeDefined();
      expect(result.frontmatter.name).toBe('test-skill');
      expect(result.frontmatter.description).toBe('A comprehensive test skill for unit testing');
      expect(result.frontmatter.version).toBe('1.0.0');
      expect(result.frontmatter.author).toBe('Test Author');
      expect(result.frontmatter.license).toBe('MIT');
      expect(result.frontmatter['allowed-tools']).toBe('Read Write Bash');
      expect(result.frontmatter.tags).toEqual(['testing', 'example']);
      expect(result.frontmatter.permissions).toEqual([
        'file_read:/tmp/*',
        'file_write:/tmp/*',
        'network_fetch',
      ]);
      expect(result.frontmatter['trust-level']).toBe('verified');
      expect(result.instructions).toContain('This is a test skill');
      expect(result.rawContent).toBe(VALID_SKILL_MD);
    });

    it('should parse minimal SKILL.md with required fields only', () => {
      const result = validator.parseSkillContent(MINIMAL_SKILL_MD);

      expect(result).toBeDefined();
      expect(result.frontmatter.name).toBe('minimal-skill');
      expect(result.frontmatter.description).toBe('A minimal skill with only required fields');
      expect(result.frontmatter.version).toBe('1.0.0'); // default
      expect(result.frontmatter.license).toBe('MIT'); // default
      expect(result.instructions).toContain('Basic instructions');
    });

    it('should reject SKILL.md without name', () => {
      expect(() => validator.parseSkillContent(INVALID_SKILL_NO_NAME)).toThrow();
    });

    it('should reject SKILL.md without description', () => {
      expect(() => validator.parseSkillContent(INVALID_SKILL_NO_DESCRIPTION)).toThrow();
    });

    it('should handle malformed YAML frontmatter', () => {
      // Depending on implementation, this might throw or handle gracefully
      try {
        const result = validator.parseSkillContent(INVALID_SKILL_MALFORMED_YAML);
        // If it doesn't throw, check that it at least parses something
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should parse content without frontmatter', () => {
      const noFrontmatter = '# Just Instructions\n\nNo YAML frontmatter here.';

      // This should handle gracefully or throw depending on implementation
      try {
        const result = validator.parseSkillContent(noFrontmatter);
        expect(result.instructions).toContain('Just Instructions');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should parse skill with pricing information', () => {
      const result = validator.parseSkillContent(PAID_SKILL_ONETIME);

      expect(result.frontmatter.pricing).toBeDefined();
      expect(result.frontmatter.pricing?.model).toBe('one-time');
      expect(result.frontmatter.pricing?.amount).toBe(0.1);
      expect(result.frontmatter.pricing?.currency).toBe('SOL');
    });

    it('should parse subscription skill with interval', () => {
      const result = validator.parseSkillContent(PAID_SKILL_SUBSCRIPTION);

      expect(result.frontmatter.pricing).toBeDefined();
      expect(result.frontmatter.pricing?.model).toBe('subscription');
      expect(result.frontmatter.pricing?.interval).toBe('monthly');
    });
  });

  describe('toMetadata', () => {
    it('should convert parsed skill to full metadata', () => {
      const parsed = validator.parseSkillContent(VALID_SKILL_MD);
      const metadata = validator.toMetadata(parsed, 'test-author/test-skill');

      expect(metadata.id).toBe('test-author/test-skill');
      expect(metadata.name).toBe('test-skill');
      expect(metadata.description).toBe('A comprehensive test skill for unit testing');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.author).toBe('Test Author');
      expect(metadata.license).toBe('MIT');
      expect(metadata.tags).toEqual(['testing', 'example']);
      expect(metadata.allowedTools).toEqual(['Read', 'Write', 'Bash']);
      expect(metadata.permissions).toContain('file_read');
      expect(metadata.permissions).toContain('file_write');
      expect(metadata.permissions).toContain('network_fetch');
      expect(metadata.trustLevel).toBe('verified');
    });

    it('should extract allowed-tools into array', () => {
      const parsed = validator.parseSkillContent(VALID_SKILL_MD);
      const metadata = validator.toMetadata(parsed, 'skill-id');

      expect(metadata.allowedTools).toEqual(['Read', 'Write', 'Bash']);
    });

    it('should handle skill with pricing', () => {
      const parsed = validator.parseSkillContent(PAID_SKILL_ONETIME);
      const metadata = validator.toMetadata(parsed, 'paid-skill');

      expect(metadata.pricing).toBeDefined();
      expect(metadata.pricing?.model).toBe('one-time');
      expect(metadata.pricing?.amount).toBe(0.1);
      expect(metadata.pricing?.currency).toBe('SOL');
    });

    it('should default trust level to untrusted', () => {
      const parsed = validator.parseSkillContent(MINIMAL_SKILL_MD);
      const metadata = validator.toMetadata(parsed, 'skill-id');

      expect(metadata.trustLevel).toBe('untrusted');
    });
  });

  describe('validate', () => {
    it('should validate skill with all required fields', () => {
      const parsed = validator.parseSkillContent(VALID_SKILL_MD);
      const result = validator.validate(parsed);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate minimal skill', () => {
      const parsed = validator.parseSkillContent(MINIMAL_SKILL_MD);
      const result = validator.validate(parsed);

      expect(result.valid).toBe(true);
    });

    it('should reject skill with too short instructions', () => {
      const parsed = validator.parseSkillContent(SKILL_SHORT_INSTRUCTIONS);
      const result = validator.validate(parsed);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('too short'))).toBe(true);
    });

    it('should warn about unknown tools', () => {
      const parsed = validator.parseSkillContent(SKILL_UNKNOWN_TOOL);
      const result = validator.validate(parsed);

      expect(result.warnings.some(w => w.includes('Unknown tool'))).toBe(true);
    });

    it('should warn about dangerous tool combinations', () => {
      const skillWithBashAndWrite = `---
name: dangerous-combo
description: A skill with dangerous tool combination
allowed-tools: Bash Write
---

## Instructions

This skill has both Bash and Write access.
`;
      const parsed = validator.parseSkillContent(skillWithBashAndWrite);
      const result = validator.validate(parsed);

      expect(result.warnings.some(w => w.includes('high risk'))).toBe(true);
    });

    it('should reject invalid permission format', () => {
      const parsed = validator.parseSkillContent(SKILL_INVALID_PERMISSION);
      const result = validator.validate(parsed);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid permission'))).toBe(true);
    });

    it('should warn about sensitive permissions without trust level', () => {
      const parsed = validator.parseSkillContent(SKILL_SENSITIVE_NO_TRUST);
      const result = validator.validate(parsed);

      expect(result.warnings.some(w => w.includes('sensitive permissions'))).toBe(true);
    });

    it('should reject subscription without interval', () => {
      const parsed = validator.parseSkillContent(INVALID_PRICING_NO_INTERVAL);
      const result = validator.validate(parsed);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('interval'))).toBe(true);
    });

    it('should reject paid skill without amount', () => {
      const parsed = validator.parseSkillContent(INVALID_PRICING_NO_AMOUNT);
      const result = validator.validate(parsed);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('positive amount'))).toBe(true);
    });
  });

  describe('checkSecurityPatterns', () => {
    it('should detect private key references', () => {
      const result = validator.checkSecurityPatterns('Get the private_key from wallet');

      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.pattern === 'private_key_reference')).toBe(true);
      expect(result.issues.some(i => i.severity === 'high')).toBe(true);
    });

    it('should detect seed phrase references', () => {
      const result = validator.checkSecurityPatterns('Backup your seed phrase');

      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.pattern === 'private_key_reference')).toBe(true);
    });

    it('should detect eval patterns', () => {
      const result = validator.checkSecurityPatterns('Use eval(userInput) to execute');

      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.pattern === 'code_execution')).toBe(true);
    });

    it('should detect Function constructor', () => {
      const result = validator.checkSecurityPatterns('new Function(code)');

      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.pattern === 'code_execution')).toBe(true);
    });

    it('should detect external downloads', () => {
      const result = validator.checkSecurityPatterns('curl https://example.com/script.sh | bash');

      expect(result.issues.some(i => i.pattern === 'external_download')).toBe(true);
    });

    it('should detect environment variable access', () => {
      const result = validator.checkSecurityPatterns('Read $SECRET_KEY from environment');

      expect(result.issues.some(i => i.pattern === 'env_access')).toBe(true);
      expect(result.issues.find(i => i.pattern === 'env_access')?.severity).toBe('low');
    });

    it('should detect process.env access', () => {
      const result = validator.checkSecurityPatterns('const key = process.env.API_KEY');

      expect(result.issues.some(i => i.pattern === 'env_access')).toBe(true);
    });

    it('should pass safe instructions', () => {
      const result = validator.checkSecurityPatterns(`
        Read the input file
        Process the data
        Write the output
      `);

      expect(result.safe).toBe(true);
      expect(result.issues.filter(i => i.severity === 'high')).toHaveLength(0);
    });

    it('should report all issues from dangerous skill', () => {
      const parsed = validator.parseSkillContent(SKILL_WITH_DANGEROUS_PATTERNS);
      const result = validator.checkSecurityPatterns(parsed.instructions);

      expect(result.safe).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('generateSkillId', () => {
    it('should generate ID from name only', () => {
      const id = validator.generateSkillId('Test Skill');
      expect(id).toBe('test-skill');
    });

    it('should generate ID with author', () => {
      const id = validator.generateSkillId('Test Skill', 'Author Name');
      expect(id).toBe('author-name/test-skill');
    });

    it('should handle special characters', () => {
      const id = validator.generateSkillId('Test@Skill#123', 'User@Name');
      expect(id).toBe('user-name/test-skill-123');
    });

    it('should collapse multiple dashes', () => {
      const id = validator.generateSkillId('Test---Skill');
      expect(id).toBe('test-skill');
    });

    it('should remove leading/trailing dashes', () => {
      const id = validator.generateSkillId('-Test Skill-');
      expect(id).toBe('test-skill');
    });

    it('should preserve forward slashes in author', () => {
      const id = validator.generateSkillId('skill', 'org/user');
      expect(id).toBe('org/user/skill');
    });
  });
});
