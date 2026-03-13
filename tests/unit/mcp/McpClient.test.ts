import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpClient, McpClientManager } from '../../../src/mcp/McpClient';
import {
  createMockMcpServerConfig,
  MCP_TOOLS_LIST,
  MCP_CAPABILITIES,
  MCP_INITIALIZE_RESPONSE,
} from '../../fixtures/mcp-responses';

describe('McpClient', () => {
  let client: McpClient;

  beforeEach(() => {
    client = new McpClient({
      id: 'test-server',
      name: 'Test Server',
      transport: 'stdio',
      command: 'node',
      args: ['test-server.js'],
      trustLevel: 'verified',
      enabled: true,
    });
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('constructor', () => {
    it('should create McpClient instance', () => {
      expect(client).toBeInstanceOf(McpClient);
    });

    it('should accept stdio transport config', () => {
      const stdioClient = new McpClient({
        id: 'stdio-server',
        name: 'Stdio Server',
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        trustLevel: 'verified',
        enabled: true,
      });

      expect(stdioClient.getServerInfo().transport).toBe('stdio');
      stdioClient.disconnect();
    });

    it('should accept http transport config', () => {
      const httpClient = new McpClient({
        id: 'http-server',
        name: 'HTTP Server',
        transport: 'http',
        url: 'http://localhost:8080',
        trustLevel: 'verified',
        enabled: true,
      });

      expect(httpClient.getServerInfo().transport).toBe('http');
      httpClient.disconnect();
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getServerInfo', () => {
    it('should return server configuration', () => {
      const info = client.getServerInfo();

      expect(info.id).toBe('test-server');
      expect(info.name).toBe('Test Server');
      expect(info.transport).toBe('stdio');
      expect(info.trustLevel).toBe('verified');
    });
  });

  describe('getTools', () => {
    it('should return empty array when not connected', () => {
      const tools = client.getTools();
      expect(tools).toEqual([]);
    });
  });

  describe('getCapabilities', () => {
    it('should return empty object when not connected', () => {
      const capabilities = client.getCapabilities();
      expect(capabilities).toEqual({});
    });
  });

  describe('event emitter', () => {
    it('should emit connected event', () => {
      const handler = vi.fn();
      client.on('connected', handler);

      expect(client.listenerCount('connected')).toBe(1);
    });

    it('should emit disconnected event', () => {
      const handler = vi.fn();
      client.on('disconnected', handler);

      expect(client.listenerCount('disconnected')).toBe(1);
    });

    it('should emit error event', () => {
      const handler = vi.fn();
      client.on('error', handler);

      expect(client.listenerCount('error')).toBe(1);
    });

    it('should emit tools_updated event', () => {
      const handler = vi.fn();
      client.on('tools_updated', handler);

      expect(client.listenerCount('tools_updated')).toBe(1);
    });

    it('should remove event listener', () => {
      const handler = vi.fn();
      client.on('connected', handler);
      client.off('connected', handler);

      expect(client.listenerCount('connected')).toBe(0);
    });
  });

  describe('disconnect', () => {
    it('should complete without error', async () => {
      await expect(client.disconnect()).resolves.not.toThrow();
    });
  });
});

describe('McpClientManager', () => {
  let manager: McpClientManager;

  beforeEach(() => {
    manager = new McpClientManager();
  });

  afterEach(async () => {
    await manager.disconnectAll();
  });

  describe('constructor', () => {
    it('should create McpClientManager instance', () => {
      expect(manager).toBeInstanceOf(McpClientManager);
    });
  });

  describe('addServer', () => {
    it('should add server configuration', () => {
      const config = createMockMcpServerConfig({ id: 'server-1' });
      manager.addServer(config);

      const retrieved = manager.getServerConfig('server-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('server-1');
    });

    it('should allow multiple servers', () => {
      manager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      manager.addServer(createMockMcpServerConfig({ id: 'server-2' }));

      const configs = manager.getAllServerConfigs();
      expect(configs).toHaveLength(2);
    });

    it('should update existing server config', () => {
      manager.addServer(createMockMcpServerConfig({ id: 'server-1', name: 'Original' }));
      manager.addServer(createMockMcpServerConfig({ id: 'server-1', name: 'Updated' }));

      const config = manager.getServerConfig('server-1');
      expect(config?.name).toBe('Updated');
    });
  });

  describe('removeServer', () => {
    it('should remove server configuration', () => {
      manager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      manager.removeServer('server-1');

      expect(manager.getServerConfig('server-1')).toBeUndefined();
    });
  });

  describe('getServerConfig', () => {
    it('should return undefined for non-existent server', () => {
      expect(manager.getServerConfig('non-existent')).toBeUndefined();
    });
  });

  describe('getAllServerConfigs', () => {
    it('should return all server configurations', () => {
      manager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      manager.addServer(createMockMcpServerConfig({ id: 'server-2' }));
      manager.addServer(createMockMcpServerConfig({ id: 'server-3' }));

      const configs = manager.getAllServerConfigs();
      expect(configs).toHaveLength(3);
    });

    it('should return empty array when no servers', () => {
      const configs = manager.getAllServerConfigs();
      expect(configs).toEqual([]);
    });
  });

  describe('isConnected', () => {
    it('should return false for non-existent server', () => {
      expect(manager.isConnected('non-existent')).toBe(false);
    });

    it('should return false for disconnected server', () => {
      manager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      expect(manager.isConnected('server-1')).toBe(false);
    });
  });

  describe('getClient', () => {
    it('should return undefined for non-connected server', () => {
      manager.addServer(createMockMcpServerConfig({ id: 'server-1' }));
      expect(manager.getClient('server-1')).toBeUndefined();
    });
  });

  describe('getConnectedClients', () => {
    it('should return empty array when no clients connected', () => {
      const clients = manager.getConnectedClients();
      expect(clients).toEqual([]);
    });
  });

  describe('getAllTools', () => {
    it('should return empty array when no clients connected', () => {
      const tools = manager.getAllTools();
      expect(tools).toEqual([]);
    });
  });

  describe('event emitter', () => {
    it('should emit connected event', () => {
      const handler = vi.fn();
      manager.on('connected', handler);

      expect(manager.listenerCount('connected')).toBe(1);
    });

    it('should emit disconnected event', () => {
      const handler = vi.fn();
      manager.on('disconnected', handler);

      expect(manager.listenerCount('disconnected')).toBe(1);
    });

    it('should emit error event', () => {
      const handler = vi.fn();
      manager.on('error', handler);

      expect(manager.listenerCount('error')).toBe(1);
    });
  });

  describe('disconnectAll', () => {
    it('should complete without error when no connections', async () => {
      await expect(manager.disconnectAll()).resolves.not.toThrow();
    });
  });
});
