import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import {
  McpServerConfig,
  McpTool,
  McpError,
  TrustLevel,
} from '../skills/types';

export interface McpToolCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
  isError?: boolean;
}

export interface McpCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
}

interface McpMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpClient extends EventEmitter {
  private config: McpServerConfig;
  private process: ChildProcess | null = null;
  private connected: boolean = false;
  private messageId: number = 0;
  private pendingRequests: Map<number, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private buffer: string = '';
  private tools: McpTool[] = [];
  private capabilities: McpCapabilities = {};

  constructor(config: McpServerConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.config.transport === 'stdio') {
      await this.connectStdio();
    } else if (this.config.transport === 'http' || this.config.transport === 'sse') {
      await this.connectHttp();
    } else {
      throw new McpError(`Unsupported transport: ${this.config.transport}`);
    }

    this.connected = true;
    this.emit('connected', { serverId: this.config.id });
  }

  /**
   * Connect via stdio transport
   */
  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new McpError('Command is required for stdio transport');
    }

    this.process = spawn(this.config.command, this.config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // Handle stdout (responses from server)
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString());
    });

    // Handle stderr (errors)
    this.process.stderr?.on('data', (data: Buffer) => {
      this.emit('error', new McpError(`Server error: ${data.toString()}`));
    });

    // Handle process exit
    this.process.on('exit', (code) => {
      this.connected = false;
      this.emit('disconnected', { serverId: this.config.id, code });
    });

    // Initialize connection
    await this.initialize();
  }

  /**
   * Connect via HTTP/SSE transport
   */
  private async connectHttp(): Promise<void> {
    if (!this.config.url) {
      throw new McpError('URL is required for HTTP transport');
    }

    // For HTTP, we just need to verify the endpoint is reachable
    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextId(),
          method: 'initialize',
          params: {
            protocolVersion: '0.1.0',
            capabilities: {},
            clientInfo: {
              name: 'moltpay',
              version: '0.1.0',
            },
          },
        }),
      });

      if (!response.ok) {
        throw new McpError(`HTTP error: ${response.status}`);
      }

      const result = await response.json() as McpMessage;
      if (result.error) {
        throw new McpError(`MCP error: ${result.error.message}`);
      }

      this.capabilities = (result.result as { capabilities?: McpCapabilities })?.capabilities || {};
    } catch (error) {
      throw new McpError(
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Initialize the MCP session
   */
  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: {
        name: 'moltpay',
        version: '0.1.0',
      },
    });

    this.capabilities = (result as { capabilities?: McpCapabilities })?.capabilities || {};

    // Notify initialized
    await this.sendNotification('notifications/initialized', {});

    // Fetch available tools
    if (this.capabilities.tools) {
      await this.refreshTools();
    }
  }

  /**
   * Send a JSON-RPC request
   */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId();

    const message: McpMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      if (this.config.transport === 'stdio') {
        this.sendStdio(message);
      } else {
        this.sendHttp(message).then(resolve).catch(reject);
        this.pendingRequests.delete(id);
      }
    });
  }

  /**
   * Send a notification (no response expected)
   */
  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const message: McpMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    if (this.config.transport === 'stdio') {
      this.sendStdio(message);
    } else {
      await this.sendHttp(message);
    }
  }

  /**
   * Send message via stdio
   */
  private sendStdio(message: McpMessage): void {
    if (!this.process?.stdin) {
      throw new McpError('Not connected');
    }

    const json = JSON.stringify(message);
    this.process.stdin.write(json + '\n');
  }

  /**
   * Send message via HTTP
   */
  private async sendHttp(message: McpMessage): Promise<unknown> {
    if (!this.config.url) {
      throw new McpError('Not connected');
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new McpError(`HTTP error: ${response.status}`);
    }

    const result = await response.json() as McpMessage;
    if (result.error) {
      throw new McpError(`MCP error: ${result.error.message}`);
    }

    return result.result;
  }

  /**
   * Handle incoming data
   */
  private handleData(data: string): void {
    this.buffer += data;

    // Try to parse complete JSON messages
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as McpMessage;
          this.handleMessage(message);
        } catch (error) {
          this.emit('error', new McpError(`Failed to parse message: ${line}`));
        }
      }
    }
  }

  /**
   * Handle a parsed message
   */
  private handleMessage(message: McpMessage): void {
    if (message.id !== undefined) {
      // This is a response
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new McpError(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // This is a notification or request from server
      this.emit('notification', {
        method: message.method,
        params: message.params,
      });
    }
  }

  /**
   * Get next message ID
   */
  private nextId(): number {
    return ++this.messageId;
  }

  /**
   * Refresh the list of available tools
   */
  async refreshTools(): Promise<McpTool[]> {
    const result = await this.sendRequest('tools/list', {});
    const toolsList = result as { tools?: Array<{
      name: string;
      description?: string;
      inputSchema: Record<string, unknown>;
    }> };

    this.tools = (toolsList.tools || []).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      serverId: this.config.id,
    }));

    return this.tools;
  }

  /**
   * Get available tools
   */
  getTools(): McpTool[] {
    return this.tools;
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    try {
      const result = await this.sendRequest('tools/call', {
        name,
        arguments: args,
      });

      const callResult = result as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };

      // Extract text content
      const textContent = callResult.content
        ?.filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      return {
        success: !callResult.isError,
        result: textContent || result,
        isError: callResult.isError,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }
  }

  /**
   * Get server info
   */
  getServerInfo(): McpServerConfig {
    return this.config;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): McpCapabilities {
    return this.capabilities;
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    this.connected = false;

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new McpError('Disconnected'));
    }
    this.pendingRequests.clear();

    // Kill process if stdio
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.emit('disconnected', { serverId: this.config.id });
  }
}

/**
 * MCP Client Manager - manages multiple MCP connections
 */
export class McpClientManager extends EventEmitter {
  private clients: Map<string, McpClient> = new Map();
  private configs: Map<string, McpServerConfig> = new Map();

  /**
   * Add a server configuration
   */
  addServer(config: McpServerConfig): void {
    this.configs.set(config.id, config);
  }

  /**
   * Remove a server configuration
   */
  removeServer(serverId: string): void {
    this.disconnect(serverId);
    this.configs.delete(serverId);
  }

  /**
   * Get a server configuration
   */
  getServerConfig(serverId: string): McpServerConfig | undefined {
    return this.configs.get(serverId);
  }

  /**
   * Get all server configurations
   */
  getAllServerConfigs(): McpServerConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Connect to a server
   */
  async connect(serverId: string): Promise<McpClient> {
    const config = this.configs.get(serverId);
    if (!config) {
      throw new McpError(`Server not found: ${serverId}`);
    }

    if (this.clients.has(serverId)) {
      return this.clients.get(serverId)!;
    }

    const client = new McpClient(config);

    // Forward events
    client.on('connected', (data) => this.emit('connected', data));
    client.on('disconnected', (data) => {
      this.clients.delete(serverId);
      this.emit('disconnected', data);
    });
    client.on('error', (error) => this.emit('error', { serverId, error }));
    client.on('notification', (data) => this.emit('notification', { serverId, ...data }));

    await client.connect();
    this.clients.set(serverId, client);

    return client;
  }

  /**
   * Disconnect from a server
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
    }
  }

  /**
   * Get a connected client
   */
  getClient(serverId: string): McpClient | undefined {
    return this.clients.get(serverId);
  }

  /**
   * Get all connected clients
   */
  getConnectedClients(): McpClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverId: string): boolean {
    return this.clients.has(serverId) && this.clients.get(serverId)!.isConnected();
  }

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): McpTool[] {
    const tools: McpTool[] = [];
    for (const client of this.clients.values()) {
      tools.push(...client.getTools());
    }
    return tools;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new McpError(`Not connected to server: ${serverId}`);
    }
    return client.callTool(toolName, args);
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.keys()).map(id => this.disconnect(id))
    );
  }
}
