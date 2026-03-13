/**
 * Test fixtures for MCP server responses
 */

import { vi } from 'vitest';

// MCP tool list response
export const MCP_TOOLS_LIST = {
  tools: [
    {
      name: 'read_file',
      description: 'Read contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write contents to a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'fetch_url',
      description: 'Fetch data from a URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
        },
        required: ['url'],
      },
    },
    {
      name: 'run_command',
      description: 'Execute a shell command',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['command'],
      },
    },
    {
      name: 'search_database',
      description: 'Search a database',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 },
        },
        required: ['query'],
      },
    },
  ],
};

// MCP server capabilities
export const MCP_CAPABILITIES = {
  tools: true,
  resources: true,
  prompts: false,
  logging: true,
};

// MCP initialize response
export const MCP_INITIALIZE_RESPONSE = {
  protocolVersion: '1.0',
  serverInfo: {
    name: 'test-mcp-server',
    version: '1.0.0',
  },
  capabilities: MCP_CAPABILITIES,
};

// MCP tool call responses
export const MCP_TOOL_RESPONSES = {
  read_file: {
    success: {
      content: [
        {
          type: 'text',
          text: 'File contents here',
        },
      ],
    },
    error: {
      content: [
        {
          type: 'text',
          text: 'Error: File not found',
        },
      ],
      isError: true,
    },
  },
  write_file: {
    success: {
      content: [
        {
          type: 'text',
          text: 'File written successfully',
        },
      ],
    },
    error: {
      content: [
        {
          type: 'text',
          text: 'Error: Permission denied',
        },
      ],
      isError: true,
    },
  },
  fetch_url: {
    success: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ data: 'fetched data' }),
        },
      ],
    },
    error: {
      content: [
        {
          type: 'text',
          text: 'Error: Network timeout',
        },
      ],
      isError: true,
    },
  },
  run_command: {
    success: {
      content: [
        {
          type: 'text',
          text: 'Command output here',
        },
      ],
    },
    error: {
      content: [
        {
          type: 'text',
          text: 'Error: Command not found',
        },
      ],
      isError: true,
    },
  },
};

// JSON-RPC request/response fixtures
export const JSON_RPC_FIXTURES = {
  initializeRequest: {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '1.0',
      clientInfo: {
        name: 'moltpay-test',
        version: '1.0.0',
      },
      capabilities: {},
    },
  },
  initializeResponse: {
    jsonrpc: '2.0',
    id: 1,
    result: MCP_INITIALIZE_RESPONSE,
  },
  listToolsRequest: {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  },
  listToolsResponse: {
    jsonrpc: '2.0',
    id: 2,
    result: MCP_TOOLS_LIST,
  },
  callToolRequest: (toolName: string, args: Record<string, unknown>) => ({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  }),
  callToolResponse: (content: unknown[]) => ({
    jsonrpc: '2.0',
    id: 3,
    result: { content },
  }),
  errorResponse: (id: number, code: number, message: string) => ({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  }),
};

// Mock MCP server configuration
export function createMockMcpServerConfig(overrides: Partial<{
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  trustLevel: 'system' | 'verified' | 'community' | 'untrusted';
}> = {}) {
  return {
    id: overrides.id || 'test-server',
    name: overrides.name || 'Test MCP Server',
    transport: overrides.transport || 'stdio',
    command: 'node',
    args: ['test-server.js'],
    trustLevel: overrides.trustLevel || 'verified',
    enabled: true,
  };
}

// Mock MCP client
export function createMockMcpClient(connected: boolean = false) {
  const client = {
    isConnected: vi.fn().mockReturnValue(connected),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getServerInfo: vi.fn().mockReturnValue(createMockMcpServerConfig()),
    getTools: vi.fn().mockReturnValue(connected ? MCP_TOOLS_LIST.tools : []),
    refreshTools: vi.fn().mockResolvedValue(MCP_TOOLS_LIST.tools),
    getCapabilities: vi.fn().mockReturnValue(connected ? MCP_CAPABILITIES : {}),
    callTool: vi.fn().mockImplementation((name: string) => {
      const response = MCP_TOOL_RESPONSES[name as keyof typeof MCP_TOOL_RESPONSES];
      if (response) {
        return Promise.resolve(response.success);
      }
      return Promise.reject(new Error(`Unknown tool: ${name}`));
    }),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    listenerCount: vi.fn().mockReturnValue(0),
  };

  return client;
}

// Mock MCP client manager
export function createMockMcpClientManager() {
  const clients = new Map<string, ReturnType<typeof createMockMcpClient>>();
  const configs = new Map<string, ReturnType<typeof createMockMcpServerConfig>>();

  const manager = {
    addServer: vi.fn().mockImplementation((config) => {
      configs.set(config.id, config);
    }),
    removeServer: vi.fn().mockImplementation((id) => {
      configs.delete(id);
      clients.delete(id);
    }),
    getServerConfig: vi.fn().mockImplementation((id) => configs.get(id)),
    getAllServerConfigs: vi.fn().mockImplementation(() => Array.from(configs.values())),
    connect: vi.fn().mockImplementation(async (id) => {
      const client = createMockMcpClient(true);
      clients.set(id, client);
      return client;
    }),
    disconnect: vi.fn().mockImplementation(async (id) => {
      clients.delete(id);
    }),
    disconnectAll: vi.fn().mockImplementation(async () => {
      clients.clear();
    }),
    isConnected: vi.fn().mockImplementation((id) => clients.has(id)),
    getClient: vi.fn().mockImplementation((id) => clients.get(id)),
    getConnectedClients: vi.fn().mockImplementation(() => Array.from(clients.values())),
    getAllTools: vi.fn().mockImplementation(() => {
      const tools: unknown[] = [];
      for (const client of clients.values()) {
        tools.push(...client.getTools());
      }
      return tools;
    }),
    callTool: vi.fn().mockImplementation((serverId, toolName, args) => {
      const client = clients.get(serverId);
      if (!client) {
        return Promise.reject(new Error(`Server not connected: ${serverId}`));
      }
      return client.callTool(toolName, args);
    }),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    listenerCount: vi.fn().mockReturnValue(0),
  };

  return manager;
}

// HTTP transport mock responses
export const HTTP_TRANSPORT_FIXTURES = {
  sseConnection: {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    },
    events: [
      'event: message\ndata: {"jsonrpc":"2.0","method":"notification","params":{}}\n\n',
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n',
    ],
  },
};
