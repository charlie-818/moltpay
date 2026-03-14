import { EventEmitter } from 'events';
import {
  McpTool,
  McpToolAsSkill,
  McpServerConfig,
  TrustLevel,
  PermissionScope,
} from '../skills/types';
import { McpClient, McpClientManager, McpToolCallResult } from './McpClient';

export interface McpToolRegistryConfig {
  autoRefreshInterval?: number;  // Refresh tools every N ms (default: 60000)
  cacheTools?: boolean;          // Cache tool definitions (default: true)
}

export class McpToolRegistry extends EventEmitter {
  private clientManager: McpClientManager;
  private config: McpToolRegistryConfig;
  private toolCache: Map<string, McpToolAsSkill> = new Map();
  private refreshTimer?: NodeJS.Timeout;

  constructor(clientManager: McpClientManager, config: McpToolRegistryConfig = {}) {
    super();
    this.clientManager = clientManager;
    this.config = {
      autoRefreshInterval: 60000,
      cacheTools: true,
      ...config,
    };

    // Set up event forwarding
    this.clientManager.on('connected', async (data) => {
      await this.onServerConnected(data.serverId);
    });

    this.clientManager.on('disconnected', (data) => {
      this.onServerDisconnected(data.serverId);
    });

    // Start auto-refresh if configured
    if (this.config.autoRefreshInterval) {
      this.startAutoRefresh();
    }
  }

  /**
   * Handle server connection
   */
  private async onServerConnected(serverId: string): Promise<void> {
    const client = this.clientManager.getClient(serverId);
    if (!client) return;

    // Refresh tools for this server
    await this.refreshServerTools(serverId, client);
  }

  /**
   * Handle server disconnection
   */
  private onServerDisconnected(serverId: string): void {
    // Remove cached tools for this server
    for (const [key, tool] of this.toolCache) {
      if (tool.mcpServerId === serverId) {
        this.toolCache.delete(key);
        this.emit('tool:removed', tool);
      }
    }
  }

  /**
   * Refresh tools for a specific server
   */
  async refreshServerTools(serverId: string, client?: McpClient): Promise<McpToolAsSkill[]> {
    client = client || this.clientManager.getClient(serverId);
    if (!client) {
      return [];
    }

    const serverConfig = this.clientManager.getServerConfig(serverId);
    if (!serverConfig) return [];

    const tools = await client.refreshTools();
    const skillTools: McpToolAsSkill[] = [];

    for (const tool of tools) {
      const skillTool = this.convertToSkill(tool, serverConfig);
      const cacheKey = this.getToolCacheKey(serverId, tool.name);

      if (this.config.cacheTools) {
        const existing = this.toolCache.get(cacheKey);
        this.toolCache.set(cacheKey, skillTool);

        if (!existing) {
          this.emit('tool:added', skillTool);
        } else {
          this.emit('tool:updated', skillTool);
        }
      }

      skillTools.push(skillTool);
    }

    return skillTools;
  }

  /**
   * Refresh tools for all connected servers
   */
  async refreshAllTools(): Promise<McpToolAsSkill[]> {
    const allTools: McpToolAsSkill[] = [];

    for (const client of this.clientManager.getConnectedClients()) {
      const tools = await this.refreshServerTools(client.getServerInfo().id, client);
      allTools.push(...tools);
    }

    return allTools;
  }

  /**
   * Convert MCP tool to skill format
   * @param tool The MCP tool to convert
   * @param serverIdOrConfig Either a server ID string or a full McpServerConfig object
   */
  convertToSkill(tool: McpTool, serverIdOrConfig: string | McpServerConfig): McpToolAsSkill {
    const serverId = typeof serverIdOrConfig === 'string'
      ? serverIdOrConfig
      : serverIdOrConfig.id;
    const trustLevel = typeof serverIdOrConfig === 'string'
      ? 'community' as TrustLevel
      : serverIdOrConfig.trustLevel;

    const toolName = tool.name || 'unnamed-tool';

    return {
      id: `mcp:${serverId}:${toolName}`,
      name: toolName,
      description: tool.description || `MCP tool: ${toolName}`,
      version: '1.0.0',
      license: 'MCP',
      source: 'mcp' as const,
      tags: ['mcp', serverId],
      allowedTools: [],
      requiredTools: [],
      permissions: this.inferPermissions(tool),
      trustLevel: trustLevel,
      mcpServerId: serverId,
      mcpToolName: toolName,
      inputSchema: tool.inputSchema,
    };
  }

  /**
   * Cache tools for a server
   */
  cacheTools(serverId: string, tools: McpTool[]): void {
    const serverConfig = this.clientManager.getServerConfig(serverId);
    for (const tool of tools) {
      const skillTool = this.convertToSkill(tool, serverConfig || serverId);
      const cacheKey = this.getToolCacheKey(serverId, tool.name);
      this.toolCache.set(cacheKey, skillTool);
    }
  }

  /**
   * Get cached tools for a server
   */
  getCachedTools(serverId: string): McpTool[] | undefined {
    const tools = this.getToolsByServer(serverId);
    if (tools.length === 0) return undefined;
    return tools.map(skill => ({
      name: skill.mcpToolName,
      description: skill.description,
      inputSchema: skill.inputSchema || {},
      serverId: skill.mcpServerId,
    }));
  }

  /**
   * Clear cache (all or for a specific server)
   */
  clearCache(serverId?: string): void {
    if (serverId) {
      for (const [key, tool] of this.toolCache) {
        if (tool.mcpServerId === serverId) {
          this.toolCache.delete(key);
        }
      }
    } else {
      this.toolCache.clear();
    }
  }

  /**
   * Infer required permissions from tool schema
   */
  private inferPermissions(tool: McpTool): PermissionScope[] {
    const permissions: Set<PermissionScope> = new Set();

    // All MCP tools require network connection
    permissions.add('network_connect');

    // Analyze tool name and schema for additional permissions
    const toolNameLower = (tool.name || '').toLowerCase();
    const schemaStr = JSON.stringify(tool.inputSchema || {}).toLowerCase();

    // File-related tools
    if (
      toolNameLower.includes('file') ||
      toolNameLower.includes('read') ||
      schemaStr.includes('path') ||
      schemaStr.includes('filename')
    ) {
      permissions.add('file_read');
      if (
        toolNameLower.includes('write') ||
        toolNameLower.includes('create') ||
        toolNameLower.includes('edit')
      ) {
        permissions.add('file_write');
      }
    }

    // Network-related tools
    if (
      toolNameLower.includes('fetch') ||
      toolNameLower.includes('http') ||
      toolNameLower.includes('api') ||
      schemaStr.includes('url')
    ) {
      permissions.add('network_fetch');
    }

    // Execution-related tools
    if (
      toolNameLower.includes('exec') ||
      toolNameLower.includes('run') ||
      toolNameLower.includes('bash') ||
      toolNameLower.includes('shell')
    ) {
      permissions.add('system_exec');
    }

    return Array.from(permissions);
  }

  /**
   * Get all registered tools as skills
   */
  getAllTools(): McpToolAsSkill[] {
    return Array.from(this.toolCache.values());
  }

  /**
   * Get tools for a specific server
   */
  getToolsByServer(serverId: string): McpToolAsSkill[] {
    return Array.from(this.toolCache.values())
      .filter(tool => tool.mcpServerId === serverId);
  }

  /**
   * Get a specific tool
   */
  getTool(serverId: string, toolName: string): McpToolAsSkill | undefined {
    const cacheKey = this.getToolCacheKey(serverId, toolName);
    return this.toolCache.get(cacheKey);
  }

  /**
   * Call a tool
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolCallResult> {
    return this.clientManager.callTool(serverId, toolName, args);
  }

  /**
   * Search tools by name or description
   */
  searchTools(query: string): McpToolAsSkill[] {
    const queryLower = query.toLowerCase();
    return Array.from(this.toolCache.values()).filter(tool =>
      tool.name.toLowerCase().includes(queryLower) ||
      tool.description.toLowerCase().includes(queryLower)
    );
  }

  /**
   * Get tools by trust level
   */
  getToolsByTrustLevel(trustLevel: TrustLevel): McpToolAsSkill[] {
    return Array.from(this.toolCache.values())
      .filter(tool => tool.trustLevel === trustLevel);
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshAllTools();
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.autoRefreshInterval);
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Get tool cache key
   */
  private getToolCacheKey(serverId: string, toolName: string): string {
    return `${serverId}:${toolName}`;
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.toolCache.size;
  }

  /**
   * Get tool count by server
   */
  getToolCountByServer(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const tool of this.toolCache.values()) {
      counts[tool.mcpServerId] = (counts[tool.mcpServerId] || 0) + 1;
    }

    return counts;
  }
}
