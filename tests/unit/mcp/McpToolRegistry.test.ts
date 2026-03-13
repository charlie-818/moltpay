import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpToolRegistry } from '../../../src/mcp/McpToolRegistry';
import {
  createMockMcpClientManager,
  createMockMcpClient,
  createMockMcpServerConfig,
  MCP_TOOLS_LIST,
} from '../../fixtures/mcp-responses';

describe('McpToolRegistry', () => {
  let registry: McpToolRegistry;
  let mockClientManager: ReturnType<typeof createMockMcpClientManager>;

  beforeEach(() => {
    mockClientManager = createMockMcpClientManager();
    registry = new McpToolRegistry(mockClientManager as any, {
      autoRefreshInterval: 0, // Disable auto-refresh for tests
      cacheTools: true,
    });
  });

  afterEach(() => {
    registry.stopAutoRefresh();
    registry.clearCache();
  });

  describe('constructor', () => {
    it('should create registry instance', () => {
      expect(registry).toBeInstanceOf(McpToolRegistry);
    });

    it('should start auto-refresh when configured', () => {
      const autoRefreshRegistry = new McpToolRegistry(mockClientManager as any, {
        autoRefreshInterval: 60000,
      });

      // Just verify it doesn't throw
      expect(autoRefreshRegistry).toBeDefined();
      autoRefreshRegistry.stopAutoRefresh();
    });
  });

  describe('convertToSkill', () => {
    it('should convert MCP tool to skill format', () => {
      const tool = MCP_TOOLS_LIST.tools[0];
      const serverConfig = createMockMcpServerConfig({ id: 'test-server' });

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.id).toBe('mcp:test-server:read_file');
      expect(skill.name).toBe('read_file');
      expect(skill.mcpServerId).toBe('test-server');
      expect(skill.mcpToolName).toBe('read_file');
    });

    it('should include input schema', () => {
      const tool = MCP_TOOLS_LIST.tools[0];
      const serverConfig = createMockMcpServerConfig();

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.inputSchema).toBeDefined();
      expect(skill.inputSchema.properties).toBeDefined();
    });

    it('should inherit trust level from server', () => {
      const tool = MCP_TOOLS_LIST.tools[0];
      const serverConfig = createMockMcpServerConfig({ trustLevel: 'verified' });

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.trustLevel).toBe('verified');
    });

    it('should add mcp tag', () => {
      const tool = MCP_TOOLS_LIST.tools[0];
      const serverConfig = createMockMcpServerConfig({ id: 'test-server' });

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.tags).toContain('mcp');
      expect(skill.tags).toContain('test-server');
    });

    it('should set default version and license', () => {
      const tool = MCP_TOOLS_LIST.tools[0];
      const serverConfig = createMockMcpServerConfig();

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.version).toBe('1.0.0');
      expect(skill.license).toBe('MCP');
    });
  });

  describe('inferred permissions', () => {
    it('should infer network_connect for all MCP tools', () => {
      const tool = { name: 'simple_tool', description: 'A simple tool', inputSchema: {} };
      const serverConfig = createMockMcpServerConfig();

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.permissions).toContain('network_connect');
    });

    it('should infer file_read for file-related tools', () => {
      const tool = { name: 'read_file', description: 'Read a file', inputSchema: {} };
      const serverConfig = createMockMcpServerConfig();

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.permissions).toContain('file_read');
    });

    it('should infer file_write for write tools', () => {
      const tool = { name: 'write_file', description: 'Write a file', inputSchema: {} };
      const serverConfig = createMockMcpServerConfig();

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.permissions).toContain('file_write');
    });

    it('should infer network_fetch for fetch tools', () => {
      const tool = { name: 'fetch_url', description: 'Fetch from URL', inputSchema: {} };
      const serverConfig = createMockMcpServerConfig();

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.permissions).toContain('network_fetch');
    });

    it('should infer system_exec for exec tools', () => {
      const tool = { name: 'run_command', description: 'Execute command', inputSchema: {} };
      const serverConfig = createMockMcpServerConfig();

      const skill = registry.convertToSkill(tool as any, serverConfig);

      expect(skill.permissions).toContain('system_exec');
    });
  });

  describe('getAllTools', () => {
    it('should return all cached tools', async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');

      await registry.refreshServerTools('server-1');

      const tools = registry.getAllTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should return empty array when no tools cached', () => {
      const tools = registry.getAllTools();
      expect(tools).toEqual([]);
    });
  });

  describe('getToolsByServer', () => {
    it('should filter tools by server', async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');
      await registry.refreshServerTools('server-1');

      const tools = registry.getToolsByServer('server-1');
      expect(tools.every(t => t.mcpServerId === 'server-1')).toBe(true);
    });

    it('should return empty array for unknown server', () => {
      const tools = registry.getToolsByServer('unknown');
      expect(tools).toEqual([]);
    });
  });

  describe('getTool', () => {
    it('should get specific tool', async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');
      await registry.refreshServerTools('server-1');

      const tool = registry.getTool('server-1', 'read_file');
      expect(tool).toBeDefined();
      expect(tool?.mcpToolName).toBe('read_file');
    });

    it('should return undefined for unknown tool', () => {
      const tool = registry.getTool('server-1', 'unknown_tool');
      expect(tool).toBeUndefined();
    });
  });

  describe('refreshServerTools', () => {
    it('should refresh tools from server', async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');

      const tools = await registry.refreshServerTools('server-1');

      expect(tools.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-connected server', async () => {
      const tools = await registry.refreshServerTools('non-existent');
      expect(tools).toEqual([]);
    });

    it('should emit tool:added event for new tools', async () => {
      const handler = vi.fn();
      registry.on('tool:added', handler);

      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');
      await registry.refreshServerTools('server-1');

      expect(handler).toHaveBeenCalled();
    });

    it('should emit tool:updated event for existing tools', async () => {
      const handler = vi.fn();
      registry.on('tool:updated', handler);

      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');
      await registry.refreshServerTools('server-1');

      // Refresh again
      await registry.refreshServerTools('server-1');

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('refreshAllTools', () => {
    it('should refresh tools from all connected servers', async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-2' }));
      await mockClientManager.connect('server-1');
      await mockClientManager.connect('server-2');

      const tools = await registry.refreshAllTools();

      expect(tools.length).toBeGreaterThan(0);
    });

    it('should return empty array when no servers connected', async () => {
      const tools = await registry.refreshAllTools();
      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should call tool through client manager', async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');

      const result = await registry.callTool('server-1', 'read_file', { path: '/test' });

      expect(mockClientManager.callTool).toHaveBeenCalledWith('server-1', 'read_file', { path: '/test' });
      expect(result).toBeDefined();
    });
  });

  describe('searchTools', () => {
    beforeEach(async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');
      await registry.refreshServerTools('server-1');
    });

    it('should search by name', () => {
      const results = registry.searchTools('read');
      expect(results.some(t => t.name.includes('read'))).toBe(true);
    });

    it('should search by description', () => {
      const results = registry.searchTools('file');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty for no matches', () => {
      const results = registry.searchTools('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should be case-insensitive', () => {
      const results = registry.searchTools('READ');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getToolsByTrustLevel', () => {
    beforeEach(async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1', trustLevel: 'verified' }));
      await mockClientManager.connect('server-1');
      await registry.refreshServerTools('server-1');
    });

    it('should filter by trust level', () => {
      const verified = registry.getToolsByTrustLevel('verified');
      expect(verified.every(t => t.trustLevel === 'verified')).toBe(true);
    });

    it('should return empty for non-matching trust level', () => {
      const system = registry.getToolsByTrustLevel('system');
      expect(system).toHaveLength(0);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached tools', async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');
      await registry.refreshServerTools('server-1');

      registry.clearCache();

      expect(registry.getAllTools()).toHaveLength(0);
    });
  });

  describe('getToolCount', () => {
    it('should return total tool count', async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');
      await registry.refreshServerTools('server-1');

      const count = registry.getToolCount();
      expect(count).toBeGreaterThan(0);
    });

    it('should return 0 when no tools', () => {
      expect(registry.getToolCount()).toBe(0);
    });
  });

  describe('getToolCountByServer', () => {
    it('should return counts grouped by server', async () => {
      mockClientManager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      await mockClientManager.connect('server-1');
      await registry.refreshServerTools('server-1');

      const counts = registry.getToolCountByServer();

      expect(counts['server-1']).toBeGreaterThan(0);
    });

    it('should return empty object when no tools', () => {
      const counts = registry.getToolCountByServer();
      expect(Object.keys(counts)).toHaveLength(0);
    });
  });

  describe('stopAutoRefresh', () => {
    it('should stop auto refresh timer', () => {
      const autoRefreshRegistry = new McpToolRegistry(mockClientManager as any, {
        autoRefreshInterval: 1000,
      });

      // Should not throw
      autoRefreshRegistry.stopAutoRefresh();
      autoRefreshRegistry.stopAutoRefresh(); // Call twice to test idempotency
    });
  });
});
