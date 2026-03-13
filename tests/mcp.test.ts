import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpClient, McpClientManager } from '../src/mcp/McpClient';

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
    });
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('constructor', () => {
    it('should create an MCP client', () => {
      expect(client).toBeInstanceOf(McpClient);
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getServerInfo', () => {
    it('should return server config', () => {
      const config = client.getServerInfo();
      expect(config.id).toBe('test-server');
      expect(config.name).toBe('Test Server');
      expect(config.transport).toBe('stdio');
    });
  });

  describe('getTools', () => {
    it('should return empty array when not connected', () => {
      const tools = client.getTools();
      expect(tools).toEqual([]);
    });
  });

  describe('getCapabilities', () => {
    it('should return empty capabilities when not connected', () => {
      const capabilities = client.getCapabilities();
      expect(capabilities).toEqual({});
    });
  });

  describe('events', () => {
    it('should emit events', () => {
      const events: string[] = [];
      client.on('connected', () => events.push('connected'));
      client.on('disconnected', () => events.push('disconnected'));
      client.on('error', () => events.push('error'));

      expect(client.listenerCount('connected')).toBe(1);
      expect(client.listenerCount('disconnected')).toBe(1);
      expect(client.listenerCount('error')).toBe(1);
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
    it('should create an MCP client manager', () => {
      expect(manager).toBeInstanceOf(McpClientManager);
    });
  });

  describe('addServer', () => {
    it('should add a server configuration', () => {
      manager.addServer({
        id: 'test-server',
        name: 'Test Server',
        transport: 'stdio',
        command: 'node',
        args: ['test.js'],
        trustLevel: 'verified',
      });

      const config = manager.getServerConfig('test-server');
      expect(config).toBeDefined();
      expect(config?.id).toBe('test-server');
    });
  });

  describe('removeServer', () => {
    it('should remove a server configuration', () => {
      manager.addServer({
        id: 'test-server',
        name: 'Test Server',
        transport: 'stdio',
        command: 'node',
        trustLevel: 'verified',
      });

      manager.removeServer('test-server');

      const config = manager.getServerConfig('test-server');
      expect(config).toBeUndefined();
    });
  });

  describe('getAllServerConfigs', () => {
    it('should return all server configurations', () => {
      manager.addServer({
        id: 'server-1',
        name: 'Server 1',
        transport: 'stdio',
        command: 'node',
        trustLevel: 'verified',
      });

      manager.addServer({
        id: 'server-2',
        name: 'Server 2',
        transport: 'http',
        url: 'http://localhost:8080',
        trustLevel: 'community',
      });

      const configs = manager.getAllServerConfigs();
      expect(configs).toHaveLength(2);
    });
  });

  describe('isConnected', () => {
    it('should return false for non-existent server', () => {
      expect(manager.isConnected('nonexistent')).toBe(false);
    });
  });

  describe('getClient', () => {
    it('should return undefined for non-connected server', () => {
      const client = manager.getClient('nonexistent');
      expect(client).toBeUndefined();
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

  describe('events', () => {
    it('should emit events', () => {
      const events: string[] = [];
      manager.on('connected', () => events.push('connected'));
      manager.on('disconnected', () => events.push('disconnected'));
      manager.on('error', () => events.push('error'));

      expect(manager.listenerCount('connected')).toBe(1);
      expect(manager.listenerCount('disconnected')).toBe(1);
      expect(manager.listenerCount('error')).toBe(1);
    });
  });
});
