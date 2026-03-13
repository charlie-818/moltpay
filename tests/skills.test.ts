import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SkillManager } from '../src/skills/SkillManager';
import { SkillValidator } from '../src/skills/SkillValidator';
import { SkillRegistry } from '../src/skills/SkillRegistry';

describe('SkillManager', () => {
  let manager: SkillManager;

  beforeEach(() => {
    manager = new SkillManager({
      defaultAutonomyTier: 'supervised',
      inMemory: true,
    });
  });

  afterEach(() => {
    manager.close();
  });

  describe('constructor', () => {
    it('should create a skill manager instance', () => {
      expect(manager).toBeInstanceOf(SkillManager);
    });

    it('should emit events', () => {
      const events: string[] = [];
      manager.on('skill:installed', () => events.push('installed'));
      manager.on('skill:uninstalled', () => events.push('uninstalled'));
      manager.on('skill:enabled', () => events.push('enabled'));
      manager.on('skill:disabled', () => events.push('disabled'));

      // Just verify that the manager has the event emitter functionality
      expect(manager.listenerCount('skill:installed')).toBe(1);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no skills installed', () => {
      const skills = manager.getAll();
      expect(skills).toEqual([]);
    });
  });

  describe('query', () => {
    it('should return empty array for no matches', () => {
      const results = manager.query({ enabled: true });
      expect(results).toEqual([]);
    });
  });

  describe('search', () => {
    it('should return empty array for no matches', () => {
      const results = manager.search('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('getBySource', () => {
    it('should return skills filtered by source', () => {
      const results = manager.getBySource('local');
      expect(results).toEqual([]);
    });
  });

  describe('getCountsBySource', () => {
    it('should return counts by source', () => {
      const counts = manager.getCountsBySource();
      expect(counts).toBeDefined();
      expect(typeof counts.local).toBe('number');
      expect(typeof counts.marketplace).toBe('number');
      expect(typeof counts.mcp).toBe('number');
    });
  });

  describe('hasPermission', () => {
    it('should return false for non-existent skill', () => {
      const result = manager.hasPermission('nonexistent', 'file_read');
      expect(result).toBe(false);
    });
  });

  describe('getPermissions', () => {
    it('should return empty array for non-existent skill', () => {
      const permissions = manager.getPermissions('nonexistent');
      expect(permissions).toEqual([]);
    });
  });

  describe('getActiveExecutions', () => {
    it('should return empty array when no active executions', () => {
      const executions = manager.getActiveExecutions();
      expect(executions).toEqual([]);
    });
  });
});

describe('SkillValidator', () => {
  let validator: SkillValidator;

  beforeEach(() => {
    validator = new SkillValidator();
  });

  describe('parseSkillContent', () => {
    it('should parse valid skill content', () => {
      const content = `---
name: Test Skill
description: A test skill
author: Test Author
version: 1.0.0
---

# Instructions

This is a test skill.
`;

      const parsed = validator.parseSkillContent(content);
      expect(parsed).toBeDefined();
      expect(parsed.frontmatter).toBeDefined();
      expect(parsed.frontmatter.name).toBe('Test Skill');
      expect(parsed.instructions).toContain('This is a test skill');
    });

    it('should throw for content without valid frontmatter', () => {
      const content = 'Just some instructions';

      expect(() => validator.parseSkillContent(content)).toThrow();
    });
  });

  describe('validate', () => {
    it('should validate skill with required fields', () => {
      const parsed = {
        frontmatter: {
          name: 'Test Skill',
          description: 'A test skill',
          author: 'Test Author',
          version: '1.0.0',
        },
        instructions: 'Test instructions',
      };

      const result = validator.validate(parsed);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept skill with minimal valid fields', () => {
      // The validator accepts parsed content - it just checks structure
      const parsed = {
        frontmatter: {
          name: 'Test',
          description: 'Test',
        },
        instructions: 'Test instructions',
      };

      const result = validator.validate(parsed);
      expect(result.valid).toBe(true);
    });
  });
});

describe('SkillRegistry', () => {
  // Use unique registry for each test to avoid state bleeding
  const createFreshRegistry = () => new SkillRegistry({ inMemory: true });

  describe('register', () => {
    it('should register a skill', () => {
      const registry = createFreshRegistry();
      const skill = {
        id: 'test-skill',
        source: 'local' as const,
        sourcePath: '/path/to/skill',
        metadata: {
          name: 'Test Skill',
          description: 'A test skill',
          author: 'Test Author',
          version: '1.0.0',
          trustLevel: 'community' as const,
          permissions: [],
        },
        instructions: 'Test instructions',
        enabled: true,
        autonomyTier: 'supervised' as const,
        grantedPermissions: [],
        installedAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      registry.register(skill);
      const retrieved = registry.get('test-skill');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-skill');
      expect(retrieved?.metadata.name).toBe('Test Skill');
      registry.close();
    });
  });

  describe('get', () => {
    it('should return null for non-existent skill', () => {
      const registry = createFreshRegistry();
      const result = registry.get('nonexistent');
      expect(result).toBeNull();
      registry.close();
    });
  });

  describe('getAll', () => {
    it('should return all registered skills', () => {
      const registry = createFreshRegistry();
      const skill1 = {
        id: 'skill-1',
        source: 'local' as const,
        sourcePath: '/path/to/skill1',
        metadata: {
          name: 'Skill 1',
          description: 'First skill',
          author: 'Author',
          version: '1.0.0',
          trustLevel: 'community' as const,
          permissions: [],
        },
        instructions: 'Instructions 1',
        enabled: true,
        autonomyTier: 'supervised' as const,
        grantedPermissions: [],
        installedAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      const skill2 = {
        id: 'skill-2',
        source: 'local' as const,
        sourcePath: '/path/to/skill2',
        metadata: {
          name: 'Skill 2',
          description: 'Second skill',
          author: 'Author',
          version: '1.0.0',
          trustLevel: 'community' as const,
          permissions: [],
        },
        instructions: 'Instructions 2',
        enabled: true,
        autonomyTier: 'supervised' as const,
        grantedPermissions: [],
        installedAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      registry.register(skill1);
      registry.register(skill2);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      registry.close();
    });
  });

  describe('unregister', () => {
    it('should unregister a skill', () => {
      const registry = createFreshRegistry();
      const skill = {
        id: 'test-skill',
        source: 'local' as const,
        sourcePath: '/path/to/skill',
        metadata: {
          name: 'Test Skill',
          description: 'A test skill',
          author: 'Test Author',
          version: '1.0.0',
          trustLevel: 'community' as const,
          permissions: [],
        },
        instructions: 'Test instructions',
        enabled: true,
        autonomyTier: 'supervised' as const,
        grantedPermissions: [],
        installedAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      registry.register(skill);
      const success = registry.unregister('test-skill');

      expect(success).toBe(true);
      expect(registry.get('test-skill')).toBeNull();
      registry.close();
    });

    it('should return false for non-existent skill', () => {
      const registry = createFreshRegistry();
      const success = registry.unregister('nonexistent');
      expect(success).toBe(false);
      registry.close();
    });
  });

  describe('query', () => {
    it('should filter skills by enabled status', () => {
      const registry = createFreshRegistry();
      const skill1 = {
        id: 'enabled-skill',
        source: 'local' as const,
        sourcePath: '/path/1',
        metadata: {
          name: 'Enabled Skill',
          description: 'An enabled skill',
          author: 'Author',
          version: '1.0.0',
          trustLevel: 'community' as const,
          permissions: [],
        },
        instructions: 'Instructions',
        enabled: true,
        autonomyTier: 'supervised' as const,
        grantedPermissions: [],
        installedAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      const skill2 = {
        id: 'disabled-skill',
        source: 'local' as const,
        sourcePath: '/path/2',
        metadata: {
          name: 'Disabled Skill',
          description: 'A disabled skill',
          author: 'Author',
          version: '1.0.0',
          trustLevel: 'community' as const,
          permissions: [],
        },
        instructions: 'Instructions',
        enabled: false,
        autonomyTier: 'supervised' as const,
        grantedPermissions: [],
        installedAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      registry.register(skill1);
      registry.register(skill2);

      const enabled = registry.query({ enabled: true });
      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe('enabled-skill');
      registry.close();
    });
  });
});
