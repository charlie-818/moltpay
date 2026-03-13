import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SkillLoader } from '../../../src/skills/SkillLoader';
import {
  VALID_SKILL_MD,
  MINIMAL_SKILL_MD,
  PAID_SKILL_ONETIME,
  createMockMarketplaceSkill,
  createMockMcpToolAsSkill,
} from '../../fixtures/skills';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    watch: vi.fn(),
  };
});

describe('SkillLoader', () => {
  let loader: SkillLoader;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    loader = new SkillLoader();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('loadFromFile', () => {
    it('should load skill from file path', async () => {
      const filePath = '/path/to/skill.md';
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readFileSync as any).mockReturnValue(VALID_SKILL_MD);

      const result = await loader.loadFromFile(filePath);

      expect(result.skill).toBeDefined();
      expect(result.skill.id).toBeDefined();
      expect(result.skill.metadata.name).toBe('test-skill');
      expect(result.skill.source).toBe('local');
      expect(result.skill.sourcePath).toContain('skill.md');
      expect(result.validation.valid).toBe(true);
    });

    it('should throw when file not found', async () => {
      const filePath = '/path/to/nonexistent.md';
      (mockFs.existsSync as any).mockReturnValue(false);

      await expect(loader.loadFromFile(filePath)).rejects.toThrow('not found');
    });

    it('should apply trust level override', async () => {
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readFileSync as any).mockReturnValue(MINIMAL_SKILL_MD);

      const result = await loader.loadFromFile('/path/to/skill.md', {
        trustLevel: 'verified',
      });

      expect(result.skill.metadata.trustLevel).toBe('verified');
    });

    it('should set correct autonomy tier based on trust level', async () => {
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readFileSync as any).mockReturnValue(VALID_SKILL_MD);

      const result = await loader.loadFromFile('/path/to/skill.md');

      // verified trust level should get 'act_confirm' autonomy tier
      expect(result.skill.autonomyTier).toBe('act_confirm');
    });

    it('should perform security check by default', async () => {
      const dangerousSkill = `---
name: dangerous
description: A dangerous skill
---

## Instructions

Use eval(code) to execute.
`;
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readFileSync as any).mockReturnValue(dangerousSkill);

      const result = await loader.loadFromFile('/path/to/skill.md');

      expect(result.validation.warnings.some(w => w.includes('Security'))).toBe(true);
    });

    it('should skip security check when option set', async () => {
      const dangerousSkill = `---
name: dangerous
description: A dangerous skill
---

## Instructions

Use eval(code) to execute.
`;
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readFileSync as any).mockReturnValue(dangerousSkill);

      const result = await loader.loadFromFile('/path/to/skill.md', {
        skipSecurityCheck: true,
      });

      expect(result.validation.warnings.filter(w => w.includes('Security'))).toHaveLength(0);
    });

    it('should throw validation error when validate option is true', async () => {
      const invalidSkill = `---
name: invalid
description: Invalid skill
---

Hi
`;
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readFileSync as any).mockReturnValue(invalidSkill);

      await expect(
        loader.loadFromFile('/path/to/skill.md', { validate: true })
      ).rejects.toThrow('validation failed');
    });

    it('should not validate when validate option is false', async () => {
      const invalidSkill = `---
name: invalid
description: Invalid skill
---

Hi
`;
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readFileSync as any).mockReturnValue(invalidSkill);

      const result = await loader.loadFromFile('/path/to/skill.md', {
        validate: false,
      });

      // Should not throw, validation is skipped
      expect(result.skill).toBeDefined();
    });
  });

  describe('loadFromContent', () => {
    it('should load skill from raw content', async () => {
      const result = await loader.loadFromContent(
        VALID_SKILL_MD,
        'local',
        '/path/to/skill.md'
      );

      expect(result.skill).toBeDefined();
      expect(result.skill.metadata.name).toBe('test-skill');
      expect(result.skill.source).toBe('local');
    });

    it('should load skill from marketplace source', async () => {
      const result = await loader.loadFromContent(
        VALID_SKILL_MD,
        'marketplace',
        'https://marketplace.example.com/skill'
      );

      expect(result.skill.source).toBe('marketplace');
    });

    it('should load skill from MCP source', async () => {
      const result = await loader.loadFromContent(
        MINIMAL_SKILL_MD,
        'mcp',
        'mcp-server-id'
      );

      expect(result.skill.source).toBe('mcp');
    });

    it('should generate skill ID from name and author', async () => {
      const result = await loader.loadFromContent(
        VALID_SKILL_MD,
        'local',
        '/path/to/skill.md'
      );

      expect(result.skill.id).toBe('test-author/test-skill');
    });

    it('should initialize empty grantedPermissions', async () => {
      const result = await loader.loadFromContent(
        VALID_SKILL_MD,
        'local',
        '/path/to/skill.md'
      );

      expect(result.skill.grantedPermissions).toEqual([]);
    });

    it('should set installedAt timestamp', async () => {
      const before = Date.now();
      const result = await loader.loadFromContent(
        VALID_SKILL_MD,
        'local',
        '/path/to/skill.md'
      );
      const after = Date.now();

      expect(result.skill.installedAt).toBeGreaterThanOrEqual(before);
      expect(result.skill.installedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('loadFromDirectory', () => {
    it('should load all .md files from directory', async () => {
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readdirSync as any).mockReturnValue([
        { name: 'skill1.md', isFile: () => true, isDirectory: () => false },
        { name: 'skill2.md', isFile: () => true, isDirectory: () => false },
      ]);
      (mockFs.readFileSync as any).mockReturnValue(MINIMAL_SKILL_MD);

      const results = await loader.loadFromDirectory('/path/to/skills');

      expect(results).toHaveLength(2);
    });

    it('should throw when directory not found', async () => {
      (mockFs.existsSync as any).mockReturnValue(false);

      await expect(loader.loadFromDirectory('/nonexistent')).rejects.toThrow('not found');
    });

    it('should ignore non-.md files', async () => {
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readdirSync as any).mockReturnValue([
        { name: 'skill.md', isFile: () => true, isDirectory: () => false },
        { name: 'readme.txt', isFile: () => true, isDirectory: () => false },
        { name: 'config.json', isFile: () => true, isDirectory: () => false },
      ]);
      (mockFs.readFileSync as any).mockReturnValue(MINIMAL_SKILL_MD);

      const results = await loader.loadFromDirectory('/path/to/skills');

      expect(results).toHaveLength(1);
    });

    it('should check subdirectories for SKILL.md', async () => {
      (mockFs.existsSync as any).mockImplementation((p: string) => {
        return p === '/path/to/skills' || p.includes('SKILL.md');
      });
      (mockFs.readdirSync as any).mockReturnValue([
        { name: 'my-skill', isFile: () => false, isDirectory: () => true },
      ]);
      (mockFs.readFileSync as any).mockReturnValue(MINIMAL_SKILL_MD);

      const results = await loader.loadFromDirectory('/path/to/skills');

      expect(results).toHaveLength(1);
    });

    it('should continue loading other skills when one fails', async () => {
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readdirSync as any).mockReturnValue([
        { name: 'good.md', isFile: () => true, isDirectory: () => false },
        { name: 'bad.md', isFile: () => true, isDirectory: () => false },
      ]);
      (mockFs.readFileSync as any).mockImplementation((filePath: string) => {
        if (filePath.includes('bad')) {
          throw new Error('Read error');
        }
        return MINIMAL_SKILL_MD;
      });

      const results = await loader.loadFromDirectory('/path/to/skills');

      expect(results).toHaveLength(1);
    });
  });

  describe('loadFromMarketplace', () => {
    it('should convert marketplace skill to installed skill', () => {
      const marketplaceSkill = createMockMarketplaceSkill();

      const result = loader.loadFromMarketplace(marketplaceSkill);

      expect(result.id).toBe(marketplaceSkill.id);
      expect(result.source).toBe('marketplace');
      expect(result.sourcePath).toBe(marketplaceSkill.downloadUrl);
      expect(result.metadata.name).toBe(marketplaceSkill.metadata.name);
      expect(result.enabled).toBe(true);
    });

    it('should set autonomy tier based on trust level', () => {
      const verifiedSkill = createMockMarketplaceSkill({ trustLevel: 'verified' });
      const result = loader.loadFromMarketplace(verifiedSkill);

      expect(result.autonomyTier).toBe('act_confirm');
    });

    it('should handle untrusted marketplace skill', () => {
      const untrustedSkill = createMockMarketplaceSkill({ trustLevel: 'untrusted' });
      const result = loader.loadFromMarketplace(untrustedSkill);

      expect(result.autonomyTier).toBe('observe_suggest');
    });
  });

  describe('mcpToolToSkill', () => {
    it('should convert MCP tool to skill', () => {
      const mcpTool = createMockMcpToolAsSkill({
        mcpServerId: 'test-server',
        mcpToolName: 'test-tool',
        trustLevel: 'verified',
      });

      const result = loader.mcpToolToSkill(mcpTool);

      expect(result.id).toBe('mcp:test-server:test-tool');
      expect(result.source).toBe('mcp');
      expect(result.sourcePath).toBe('test-server');
      expect(result.metadata.name).toBe('test-tool');
    });

    it('should generate instructions from tool schema', () => {
      const mcpTool = createMockMcpToolAsSkill();

      const result = loader.mcpToolToSkill(mcpTool);

      expect(result.instructions).toContain('MCP server');
      expect(result.instructions).toContain('Input Schema');
    });

    it('should set autonomy tier based on trust level', () => {
      const systemTool = createMockMcpToolAsSkill({ trustLevel: 'system' });
      const result = loader.mcpToolToSkill(systemTool);

      expect(result.autonomyTier).toBe('autonomous');
    });
  });

  describe('watchDirectory', () => {
    it('should return unwatch function', () => {
      const mockWatcher = { close: vi.fn() };
      (mockFs.watch as any).mockReturnValue(mockWatcher);

      const unwatch = loader.watchDirectory('/path/to/skills', {});

      expect(typeof unwatch).toBe('function');
      unwatch();
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should call onAdd callback for new files', async () => {
      const onAdd = vi.fn();
      const mockWatcher = { close: vi.fn() };
      let watchCallback: (event: string, filename: string) => void;

      (mockFs.watch as any).mockImplementation(
        (_path: string, _opts: any, callback: (event: string, filename: string) => void) => {
          watchCallback = callback;
          return mockWatcher;
        }
      );
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readFileSync as any).mockReturnValue(MINIMAL_SKILL_MD);

      loader.watchDirectory('/path/to/skills', { onAdd });

      // Simulate file addition
      watchCallback!('rename', 'new-skill.md');

      // Wait for async callback
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onAdd).toHaveBeenCalled();
    });

    it('should call onRemove callback for deleted files', async () => {
      const onRemove = vi.fn();
      const mockWatcher = { close: vi.fn() };
      let watchCallback: (event: string, filename: string) => void;

      (mockFs.watch as any).mockImplementation(
        (_path: string, _opts: any, callback: (event: string, filename: string) => void) => {
          watchCallback = callback;
          return mockWatcher;
        }
      );
      (mockFs.existsSync as any).mockReturnValue(false);

      loader.watchDirectory('/path/to/skills', { onRemove });

      // Simulate file deletion
      watchCallback!('rename', 'deleted-skill.md');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onRemove).toHaveBeenCalled();
    });

    it('should call onChange callback for modified files', async () => {
      const onChange = vi.fn();
      const mockWatcher = { close: vi.fn() };
      let watchCallback: (event: string, filename: string) => void;

      (mockFs.watch as any).mockImplementation(
        (_path: string, _opts: any, callback: (event: string, filename: string) => void) => {
          watchCallback = callback;
          return mockWatcher;
        }
      );
      (mockFs.existsSync as any).mockReturnValue(true);
      (mockFs.readFileSync as any).mockReturnValue(MINIMAL_SKILL_MD);

      loader.watchDirectory('/path/to/skills', { onChange });

      // Simulate file change
      watchCallback!('change', 'modified-skill.md');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onChange).toHaveBeenCalled();
    });

    it('should ignore non-.md files', async () => {
      const onAdd = vi.fn();
      const mockWatcher = { close: vi.fn() };
      let watchCallback: (event: string, filename: string) => void;

      (mockFs.watch as any).mockImplementation(
        (_path: string, _opts: any, callback: (event: string, filename: string) => void) => {
          watchCallback = callback;
          return mockWatcher;
        }
      );

      loader.watchDirectory('/path/to/skills', { onAdd });

      // Simulate non-.md file change
      watchCallback!('rename', 'readme.txt');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onAdd).not.toHaveBeenCalled();
    });
  });
});
