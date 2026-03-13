import {
  McpServerConfig,
  McpTool,
  McpToolAsSkill,
  TrustLevel,
  PermissionScope,
} from '../types';
import { McpClient, McpClientManager, McpToolCallResult } from '../../mcp/McpClient';
import { McpToolRegistry } from '../../mcp/McpToolRegistry';
import { InstalledSkill } from '../types';
import { SkillLoader } from '../SkillLoader';

export interface McpSourceConfig {
  servers: McpServerConfig[];
  autoConnect?: boolean;
}

export class McpSource {
  private clientManager: McpClientManager;
  private toolRegistry: McpToolRegistry;
  private loader: SkillLoader;
  private config: McpSourceConfig;

  constructor(config: McpSourceConfig) {
    this.config = config;
    this.clientManager = new McpClientManager();
    this.toolRegistry = new McpToolRegistry(this.clientManager);
    this.loader = new SkillLoader();

    // Add configured servers
    for (const server of config.servers) {
      this.clientManager.addServer(server);
    }
  }

  /**
   * Initialize and connect to all configured servers
   */
  async initialize(): Promise<void> {
    if (!this.config.autoConnect) return;

    const servers = this.config.servers.filter(s => s.enabled);
    await Promise.all(servers.map(s => this.connect(s.id)));
  }

  /**
   * Connect to an MCP server
   */
  async connect(serverId: string): Promise<McpClient> {
    return this.clientManager.connect(serverId);
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverId: string): Promise<void> {
    await this.clientManager.disconnect(serverId);
  }

  /**
   * Get all tools as skills from connected servers
   */
  getAllToolsAsSkills(): McpToolAsSkill[] {
    return this.toolRegistry.getAllTools();
  }

  /**
   * Get tools from a specific server as skills
   */
  getServerToolsAsSkills(serverId: string): McpToolAsSkill[] {
    return this.toolRegistry.getToolsByServer(serverId);
  }

  /**
   * Convert MCP tools to InstalledSkill format
   */
  getAsInstalledSkills(): InstalledSkill[] {
    const tools = this.toolRegistry.getAllTools();
    return tools.map(tool => this.loader.mcpToolToSkill(tool));
  }

  /**
   * Refresh tools for a specific server
   */
  async refreshServerTools(serverId: string): Promise<McpToolAsSkill[]> {
    return this.toolRegistry.refreshServerTools(serverId);
  }

  /**
   * Refresh tools for all connected servers
   */
  async refreshAllTools(): Promise<McpToolAsSkill[]> {
    return this.toolRegistry.refreshAllTools();
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolCallResult> {
    return this.clientManager.callTool(serverId, toolName, args);
  }

  /**
   * Add a new MCP server
   */
  addServer(config: McpServerConfig): void {
    this.clientManager.addServer(config);
  }

  /**
   * Remove an MCP server
   */
  async removeServer(serverId: string): Promise<void> {
    await this.disconnect(serverId);
    this.clientManager.removeServer(serverId);
  }

  /**
   * Update server configuration
   */
  updateServer(config: McpServerConfig): void {
    this.clientManager.removeServer(config.id);
    this.clientManager.addServer(config);
  }

  /**
   * Get all server configurations
   */
  getServers(): McpServerConfig[] {
    return this.clientManager.getAllServerConfigs();
  }

  /**
   * Get connected server IDs
   */
  getConnectedServerIds(): string[] {
    return this.clientManager.getConnectedClients().map(c => c.getServerInfo().id);
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverId: string): boolean {
    return this.clientManager.isConnected(serverId);
  }

  /**
   * Get tool count by server
   */
  getToolCountByServer(): Record<string, number> {
    return this.toolRegistry.getToolCountByServer();
  }

  /**
   * Search tools by name or description
   */
  searchTools(query: string): McpToolAsSkill[] {
    return this.toolRegistry.searchTools(query);
  }

  /**
   * Set event handlers
   */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.clientManager.on(event, handler);
    this.toolRegistry.on(event, handler);
  }

  /**
   * Remove event handlers
   */
  off(event: string, handler: (...args: unknown[]) => void): void {
    this.clientManager.off(event, handler);
    this.toolRegistry.off(event, handler);
  }

  /**
   * Disconnect from all servers and cleanup
   */
  async close(): Promise<void> {
    this.toolRegistry.stopAutoRefresh();
    await this.clientManager.disconnectAll();
  }
}
