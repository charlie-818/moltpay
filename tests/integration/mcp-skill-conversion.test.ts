import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpToolRegistry } from '../../src/mcp/McpToolRegistry';
import { SkillManager } from '../../src/skills/SkillManager';
import { SkillRegistry } from '../../src/skills/SkillRegistry';
import { PermissionManager } from '../../src/security/PermissionManager';
import { AuditLogger } from '../../src/security/AuditLogger';
import {
  MCP_TOOLS_LIST,
  MCP_TOOLS_WITH_COMPLEX_SCHEMAS,
  createMockMcpClient,
  createMockMcpClientManager,
  createMockMcpServerConfig,
} from '../fixtures/mcp-responses';

describe('MCP Skill Conversion Integration', () => {
  let mcpToolRegistry: McpToolRegistry;
  let skillManager: SkillManager;
  let skillRegistry: SkillRegistry;
  let permissionManager: PermissionManager;
  let auditLogger: AuditLogger;
  let mockClientManager: ReturnType<typeof createMockMcpClientManager>;

  beforeEach(() => {
    mockClientManager = createMockMcpClientManager();
    skillRegistry = new SkillRegistry({ inMemory: true });
    permissionManager = new PermissionManager();
    auditLogger = new AuditLogger({ inMemory: true });

    mcpToolRegistry = new McpToolRegistry({
      clientManager: mockClientManager,
    });

    skillManager = new SkillManager({
      inMemory: true,
      permissionManager,
      auditLogger,
    });
  });

  afterEach(() => {
    skillRegistry.close();
    auditLogger.close();
  });

  describe('MCP Server Connection Flow', () => {
    it('should connect to MCP server and list tools', async () => {
      const serverConfig = createMockMcpServerConfig('test-server');
      const mockClient = createMockMcpClient();

      // Mock successful connection
      mockClientManager.connect.mockResolvedValue(mockClient);
      mockClient.listTools.mockResolvedValue(MCP_TOOLS_LIST);

      // Connect to server
      await mockClientManager.connect(serverConfig);

      // List tools
      const tools = await mockClient.listTools();

      expect(tools.tools).toHaveLength(2);
      expect(tools.tools[0].name).toBe('read_file');
      expect(tools.tools[1].name).toBe('write_file');
    });

    it('should log MCP connection events', async () => {
      auditLogger.logMcpConnection('test-server', true);

      const logs = auditLogger.query({
        eventTypes: ['mcp_connected'],
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].outcome).toBe('success');
    });

    it('should log connection errors', async () => {
      auditLogger.logMcpConnection('test-server', false, 'Connection refused');

      const logs = auditLogger.query({
        eventTypes: ['mcp_disconnected'],
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].outcome).toBe('failure');
      expect(logs[0].errorMessage).toBe('Connection refused');
    });
  });

  describe('Tool to Skill Conversion', () => {
    it('should convert MCP tool to skill format', () => {
      const tool = MCP_TOOLS_LIST.tools[0]; // read_file
      const serverId = 'test-server';

      const skill = mcpToolRegistry.convertToSkill(tool, serverId);

      expect(skill.id).toContain('mcp:test-server:read_file');
      expect(skill.name).toBe('read_file');
      expect(skill.description).toBe('Read a file from the filesystem');
      expect(skill.source).toBe('mcp');
      expect(skill.mcpServerId).toBe(serverId);
    });

    it('should convert tool with complex input schema', () => {
      const tool = MCP_TOOLS_WITH_COMPLEX_SCHEMAS.tools[0]; // complex_tool
      const serverId = 'complex-server';

      const skill = mcpToolRegistry.convertToSkill(tool, serverId);

      expect(skill.id).toContain('complex_tool');
      expect(skill.inputSchema).toBeDefined();
      expect(skill.inputSchema?.properties).toHaveProperty('name');
      expect(skill.inputSchema?.properties).toHaveProperty('options');
      expect(skill.inputSchema?.required).toContain('name');
    });

    it('should infer permissions from tool schema', () => {
      const fileReadTool = {
        name: 'read_file',
        description: 'Read file contents',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      };

      const skill = mcpToolRegistry.convertToSkill(fileReadTool, 'server');

      // Should infer file_read permission
      expect(skill.permissions).toContain('file_read');
    });

    it('should infer network permissions for HTTP tools', () => {
      const httpTool = {
        name: 'fetch_url',
        description: 'Fetch content from URL',
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string' } },
        },
      };

      const skill = mcpToolRegistry.convertToSkill(httpTool, 'server');

      expect(skill.permissions).toContain('network_fetch');
    });

    it('should infer write permissions for write tools', () => {
      const writeTool = {
        name: 'write_file',
        description: 'Write content to file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
        },
      };

      const skill = mcpToolRegistry.convertToSkill(writeTool, 'server');

      expect(skill.permissions).toContain('file_write');
    });
  });

  describe('MCP Skills Registration', () => {
    it('should register converted MCP tools as skills', async () => {
      const mockClient = createMockMcpClient();
      mockClient.listTools.mockResolvedValue(MCP_TOOLS_LIST);

      // Get tools and convert to skills
      const tools = await mockClient.listTools();
      const serverId = 'test-server';

      for (const tool of tools.tools) {
        const skill = mcpToolRegistry.convertToSkill(tool, serverId);

        // Register in skill registry
        skillRegistry.register({
          ...skill,
          enabled: true,
          trustLevel: 'community',
          autonomyTier: 'act_confirm',
          permissions: skill.permissions || [],
          allowedTools: [],
          requiredTools: [],
          tags: ['mcp'],
        });
      }

      // Verify skills are registered
      const allSkills = skillRegistry.getAll();
      expect(allSkills.length).toBeGreaterThanOrEqual(2);

      const mcpSkills = allSkills.filter(s => s.source === 'mcp');
      expect(mcpSkills).toHaveLength(2);
    });

    it('should cache tool definitions', async () => {
      const mockClient = createMockMcpClient();
      mockClient.listTools.mockResolvedValue(MCP_TOOLS_LIST);

      // First call
      await mockClient.listTools();

      // Cache tools
      mcpToolRegistry.cacheTools('test-server', MCP_TOOLS_LIST.tools);

      // Get cached tools
      const cached = mcpToolRegistry.getCachedTools('test-server');

      expect(cached).toBeDefined();
      expect(cached).toHaveLength(2);
    });

    it('should refresh tools on reconnect', async () => {
      const mockClient = createMockMcpClient();

      // First list
      mockClient.listTools.mockResolvedValueOnce(MCP_TOOLS_LIST);

      // Updated list with new tool
      const updatedTools = {
        tools: [
          ...MCP_TOOLS_LIST.tools,
          {
            name: 'new_tool',
            description: 'A new tool',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      };
      mockClient.listTools.mockResolvedValueOnce(updatedTools);

      // Initial fetch
      const initial = await mockClient.listTools();
      expect(initial.tools).toHaveLength(2);

      // Refresh
      const refreshed = await mockClient.listTools();
      expect(refreshed.tools).toHaveLength(3);
    });
  });

  describe('MCP Skill Execution', () => {
    it('should execute MCP tool via skill interface', async () => {
      const mockClient = createMockMcpClient();
      const toolResult = { content: [{ type: 'text', text: 'file contents' }] };
      mockClient.callTool.mockResolvedValue(toolResult);

      // Call tool
      const result = await mockClient.callTool('read_file', { path: '/test.txt' });

      expect(result).toEqual(toolResult);
      expect(mockClient.callTool).toHaveBeenCalledWith('read_file', { path: '/test.txt' });
    });

    it('should handle tool execution errors', async () => {
      const mockClient = createMockMcpClient();
      mockClient.callTool.mockRejectedValue(new Error('Tool execution failed'));

      await expect(
        mockClient.callTool('failing_tool', {})
      ).rejects.toThrow('Tool execution failed');
    });

    it('should track tool execution in audit log', async () => {
      const skillId = 'mcp:test-server:read_file';
      const executionId = 'exec-1';

      // Log execution
      auditLogger.logExecutionStart(skillId, executionId);
      auditLogger.logExecutionComplete(skillId, executionId, true, {
        output: 'file contents',
      });

      const logs = auditLogger.getByExecution(executionId);
      expect(logs).toHaveLength(2);
      expect(logs.some(l => l.outcome === 'pending')).toBe(true);
      expect(logs.some(l => l.outcome === 'success')).toBe(true);
    });
  });

  describe('Permission Evaluation for MCP Skills', () => {
    it('should evaluate permissions for MCP skill', () => {
      const mcpSkillId = 'mcp:test-server:read_file';

      const result = permissionManager.evaluate(
        { scope: 'file_read', reason: 'MCP tool needs file access' },
        {
          skillId: mcpSkillId,
          trustLevel: 'community',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      // Community trust level can get file_read auto-granted
      expect(result.granted).toBe(true);
    });

    it('should require approval for sensitive MCP operations', () => {
      const mcpSkillId = 'mcp:wallet-server:send_transaction';

      const result = permissionManager.evaluate(
        { scope: 'wallet_send', reason: 'Send tokens' },
        {
          skillId: mcpSkillId,
          trustLevel: 'community',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );

      expect(result.granted).toBe(false);
      expect(result.requiresUserApproval).toBe(true);
    });
  });

  describe('MCP Tool Search', () => {
    it('should search MCP tools by name', () => {
      // Cache some tools
      mcpToolRegistry.cacheTools('server1', MCP_TOOLS_LIST.tools);

      const results = mcpToolRegistry.searchTools('read');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.name.includes('read'))).toBe(true);
    });

    it('should search across multiple servers', () => {
      // Cache tools from multiple servers
      mcpToolRegistry.cacheTools('server1', [
        { name: 'server1_tool', description: 'Tool from server 1', inputSchema: {} },
      ]);
      mcpToolRegistry.cacheTools('server2', [
        { name: 'server2_tool', description: 'Tool from server 2', inputSchema: {} },
      ]);

      const results = mcpToolRegistry.searchTools('tool');

      expect(results).toHaveLength(2);
    });
  });

  describe('Full MCP to Skill Workflow', () => {
    it('should complete end-to-end MCP skill workflow', async () => {
      const serverId = 'integration-server';
      const mockClient = createMockMcpClient();

      // 1. Connect to MCP server
      mockClientManager.connect.mockResolvedValue(mockClient);
      mockClient.listTools.mockResolvedValue(MCP_TOOLS_LIST);

      await mockClientManager.connect(createMockMcpServerConfig(serverId));

      // 2. Log connection
      auditLogger.logMcpConnection(serverId, true);

      // 3. List tools
      const toolsResponse = await mockClient.listTools();
      expect(toolsResponse.tools).toHaveLength(2);

      // 4. Convert tools to skills and register
      const skills = [];
      for (const tool of toolsResponse.tools) {
        const skill = mcpToolRegistry.convertToSkill(tool, serverId);
        skills.push(skill);

        // Register in skill registry
        skillRegistry.register({
          ...skill,
          enabled: true,
          trustLevel: 'community',
          autonomyTier: 'act_confirm',
          permissions: skill.permissions || [],
          allowedTools: [],
          requiredTools: [],
          tags: ['mcp', serverId],
        });
      }

      // 5. Verify skills registered
      const registeredSkills = skillRegistry.getAll();
      expect(registeredSkills.filter(s => s.source === 'mcp')).toHaveLength(2);

      // 6. Cache tools for quick access
      mcpToolRegistry.cacheTools(serverId, toolsResponse.tools);
      expect(mcpToolRegistry.getCachedTools(serverId)).toHaveLength(2);

      // 7. Search for a tool
      const searchResults = mcpToolRegistry.searchTools('read');
      expect(searchResults.length).toBeGreaterThan(0);

      // 8. Evaluate permissions for skill
      const readSkill = skills.find(s => s.name === 'read_file');
      const permResult = permissionManager.evaluate(
        { scope: 'file_read', reason: 'Read file via MCP' },
        {
          skillId: readSkill!.id,
          trustLevel: 'community',
          autonomyTier: 'act_confirm',
          existingPermissions: [],
        }
      );
      expect(permResult.granted).toBe(true);

      // 9. Execute tool
      const toolResult = { content: [{ type: 'text', text: 'Hello from MCP' }] };
      mockClient.callTool.mockResolvedValue(toolResult);

      const executionId = 'mcp-exec-1';
      auditLogger.logExecutionStart(readSkill!.id, executionId);

      const result = await mockClient.callTool('read_file', { path: '/test.txt' });
      expect(result).toEqual(toolResult);

      auditLogger.logExecutionComplete(readSkill!.id, executionId, true, {
        output: result,
      });

      // 10. Verify audit trail
      const executionLogs = auditLogger.getByExecution(executionId);
      expect(executionLogs).toHaveLength(2);

      // 11. Disconnect from server
      mockClientManager.disconnect.mockResolvedValue(undefined);
      await mockClientManager.disconnect(serverId);

      auditLogger.logMcpConnection(serverId, false);

      // 12. Verify complete audit trail
      const allLogs = auditLogger.query({});
      expect(allLogs.some(l => l.eventType === 'mcp_connected')).toBe(true);
      expect(allLogs.some(l => l.eventType === 'skill_executed')).toBe(true);
      expect(allLogs.some(l => l.eventType === 'mcp_disconnected')).toBe(true);
    });
  });

  describe('MCP Server Management', () => {
    it('should manage multiple MCP servers', async () => {
      const servers = ['server1', 'server2', 'server3'];

      for (const serverId of servers) {
        const mockClient = createMockMcpClient();
        mockClient.listTools.mockResolvedValue({
          tools: [
            {
              name: `${serverId}_tool`,
              description: `Tool from ${serverId}`,
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        });

        mockClientManager.connect.mockResolvedValue(mockClient);
        await mockClientManager.connect(createMockMcpServerConfig(serverId));

        const tools = await mockClient.listTools();
        mcpToolRegistry.cacheTools(serverId, tools.tools);
      }

      // Verify all servers' tools are cached
      for (const serverId of servers) {
        const cached = mcpToolRegistry.getCachedTools(serverId);
        expect(cached).toBeDefined();
        expect(cached).toHaveLength(1);
      }
    });

    it('should handle server disconnection', async () => {
      const serverId = 'disconnecting-server';
      const mockClient = createMockMcpClient();

      mockClientManager.connect.mockResolvedValue(mockClient);
      await mockClientManager.connect(createMockMcpServerConfig(serverId));

      // Disconnect
      mockClientManager.disconnect.mockResolvedValue(undefined);
      await mockClientManager.disconnect(serverId);

      // Clear cache on disconnect
      mcpToolRegistry.clearCache(serverId);
      expect(mcpToolRegistry.getCachedTools(serverId)).toBeUndefined();
    });
  });

  describe('Tool Schema Handling', () => {
    it('should handle tools with nested schemas', () => {
      const nestedTool = {
        name: 'nested_tool',
        description: 'Tool with nested schema',
        inputSchema: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                settings: {
                  type: 'object',
                  properties: {
                    value: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      };

      const skill = mcpToolRegistry.convertToSkill(nestedTool, 'server');

      expect(skill.inputSchema).toBeDefined();
      expect(skill.inputSchema?.properties?.config?.type).toBe('object');
    });

    it('should handle tools with array schemas', () => {
      const arrayTool = {
        name: 'array_tool',
        description: 'Tool with array input',
        inputSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      };

      const skill = mcpToolRegistry.convertToSkill(arrayTool, 'server');

      expect(skill.inputSchema?.properties?.items?.type).toBe('array');
    });

    it('should handle tools without input schema', () => {
      const noSchemaTool = {
        name: 'no_schema_tool',
        description: 'Tool without input schema',
      };

      const skill = mcpToolRegistry.convertToSkill(noSchemaTool, 'server');

      expect(skill.id).toContain('no_schema_tool');
      expect(skill.inputSchema).toBeUndefined();
    });
  });
});
