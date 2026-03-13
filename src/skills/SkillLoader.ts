import * as fs from 'fs';
import * as path from 'path';
import {
  ParsedSkill,
  SkillMetadata,
  InstalledSkill,
  SkillSource,
  MarketplaceSkill,
  McpToolAsSkill,
  SkillParseError,
  SkillValidationError,
  TrustLevel,
  AutonomyTier,
} from './types';
import { SkillValidator, ValidationResult } from './SkillValidator';

export interface LoadOptions {
  validate?: boolean;
  trustLevel?: TrustLevel;
  skipSecurityCheck?: boolean;
}

export interface LoadResult {
  skill: InstalledSkill;
  validation: ValidationResult;
}

export class SkillLoader {
  private validator: SkillValidator;

  constructor() {
    this.validator = new SkillValidator();
  }

  /**
   * Load a skill from a local SKILL.md file
   */
  async loadFromFile(filePath: string, options: LoadOptions = {}): Promise<LoadResult> {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new SkillParseError(`Skill file not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    return this.loadFromContent(content, 'local', absolutePath, options);
  }

  /**
   * Load a skill from raw content
   */
  async loadFromContent(
    content: string,
    source: SkillSource,
    sourcePath: string,
    options: LoadOptions = {}
  ): Promise<LoadResult> {
    // Parse the SKILL.md content
    const parsed = this.validator.parseSkillContent(content);

    // Validate if requested (default: true)
    const validation = options.validate !== false
      ? this.validator.validate(parsed)
      : { valid: true, errors: [], warnings: [] };

    if (!validation.valid && options.validate !== false) {
      throw new SkillValidationError(
        `Skill validation failed: ${validation.errors.join(', ')}`,
        { errors: validation.errors, warnings: validation.warnings }
      );
    }

    // Check security patterns unless skipped
    if (!options.skipSecurityCheck) {
      const securityCheck = this.validator.checkSecurityPatterns(parsed.instructions);
      if (!securityCheck.safe) {
        const highIssues = securityCheck.issues.filter(i => i.severity === 'high');
        if (highIssues.length > 0) {
          validation.warnings.push(
            ...highIssues.map(i => `Security: ${i.message}`)
          );
        }
      }
    }

    // Generate skill ID
    const id = this.validator.generateSkillId(
      parsed.frontmatter.name,
      parsed.frontmatter.author
    );

    // Build metadata
    const metadata = this.validator.toMetadata(parsed, id);

    // Apply trust level override if provided
    if (options.trustLevel) {
      metadata.trustLevel = options.trustLevel;
    }

    // Determine default autonomy tier based on trust level
    const autonomyTier = this.getDefaultAutonomyTier(metadata.trustLevel);

    const skill: InstalledSkill = {
      id,
      metadata,
      instructions: parsed.instructions,
      source,
      sourcePath,
      installedAt: Date.now(),
      enabled: true,
      autonomyTier,
      grantedPermissions: [],
    };

    return { skill, validation };
  }

  /**
   * Load all skills from a directory
   */
  async loadFromDirectory(dirPath: string, options: LoadOptions = {}): Promise<LoadResult[]> {
    const absolutePath = path.resolve(dirPath);

    if (!fs.existsSync(absolutePath)) {
      throw new SkillParseError(`Directory not found: ${absolutePath}`);
    }

    const results: LoadResult[] = [];
    const entries = fs.readdirSync(absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(absolutePath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const result = await this.loadFromFile(fullPath, options);
          results.push(result);
        } catch (error) {
          // Log but continue loading other skills
          console.warn(`Failed to load skill from ${fullPath}:`, error);
        }
      } else if (entry.isDirectory()) {
        // Check for SKILL.md in subdirectory
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          try {
            const result = await this.loadFromFile(skillFile, options);
            results.push(result);
          } catch (error) {
            console.warn(`Failed to load skill from ${skillFile}:`, error);
          }
        }
      }
    }

    return results;
  }

  /**
   * Load a skill from marketplace data
   */
  loadFromMarketplace(marketplaceSkill: MarketplaceSkill): InstalledSkill {
    const autonomyTier = this.getDefaultAutonomyTier(marketplaceSkill.metadata.trustLevel);

    return {
      id: marketplaceSkill.id,
      metadata: marketplaceSkill.metadata,
      instructions: '', // Will be downloaded separately
      source: 'marketplace',
      sourcePath: marketplaceSkill.downloadUrl,
      installedAt: Date.now(),
      enabled: true,
      autonomyTier,
      grantedPermissions: [],
    };
  }

  /**
   * Convert an MCP tool to a skill
   */
  mcpToolToSkill(tool: McpToolAsSkill): InstalledSkill {
    const autonomyTier = this.getDefaultAutonomyTier(tool.trustLevel);

    // Generate instructions from tool schema
    const instructions = this.generateMcpToolInstructions(tool);

    return {
      id: `mcp:${tool.mcpServerId}:${tool.mcpToolName}`,
      metadata: {
        ...tool,
        id: `mcp:${tool.mcpServerId}:${tool.mcpToolName}`,
      },
      instructions,
      source: 'mcp',
      sourcePath: tool.mcpServerId,
      installedAt: Date.now(),
      enabled: true,
      autonomyTier,
      grantedPermissions: [],
    };
  }

  /**
   * Watch a directory for skill changes
   */
  watchDirectory(
    dirPath: string,
    callbacks: {
      onAdd?: (result: LoadResult) => void;
      onRemove?: (filePath: string) => void;
      onChange?: (result: LoadResult) => void;
    }
  ): () => void {
    const absolutePath = path.resolve(dirPath);

    const watcher = fs.watch(absolutePath, { recursive: true }, async (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return;

      const fullPath = path.join(absolutePath, filename);

      if (eventType === 'rename') {
        if (fs.existsSync(fullPath)) {
          try {
            const result = await this.loadFromFile(fullPath);
            callbacks.onAdd?.(result);
          } catch (error) {
            console.warn(`Failed to load new skill: ${fullPath}`, error);
          }
        } else {
          callbacks.onRemove?.(fullPath);
        }
      } else if (eventType === 'change') {
        try {
          const result = await this.loadFromFile(fullPath);
          callbacks.onChange?.(result);
        } catch (error) {
          console.warn(`Failed to reload skill: ${fullPath}`, error);
        }
      }
    });

    return () => watcher.close();
  }

  /**
   * Get default autonomy tier based on trust level
   */
  private getDefaultAutonomyTier(trustLevel: TrustLevel): AutonomyTier {
    switch (trustLevel) {
      case 'system':
        return 'autonomous';
      case 'verified':
        return 'act_confirm';
      case 'community':
        return 'plan_propose';
      case 'untrusted':
      default:
        return 'observe_suggest';
    }
  }

  /**
   * Generate instructions from MCP tool schema
   */
  private generateMcpToolInstructions(tool: McpToolAsSkill): string {
    let instructions = `## ${tool.name}\n\n`;

    if (tool.description) {
      instructions += `${tool.description}\n\n`;
    }

    instructions += `### Input Schema\n\n`;
    instructions += '```json\n';
    instructions += JSON.stringify(tool.inputSchema, null, 2);
    instructions += '\n```\n\n';

    instructions += `### Usage\n\n`;
    instructions += `This skill is provided by the MCP server \`${tool.mcpServerId}\`.\n`;
    instructions += `Use the \`${tool.mcpToolName}\` tool with the required parameters.\n`;

    return instructions;
  }
}
