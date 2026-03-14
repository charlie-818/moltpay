import { EventEmitter } from 'events';
import { MoltPayTool, createMoltPayTool } from '../adapters/langchain/MoltPayTool';
import { WalletStore, StoredWallet } from './WalletStore';
import {
  MOLTPAY_MCP_TOOLS,
  zodToJsonSchema,
  getBalanceSchema,
  sendPaymentSchema,
  verifyPaymentSchema,
  getHistorySchema,
  requestAirdropSchema,
} from './tools';
import { z } from 'zod';

// Additional tool schemas for wallet management
const listWalletsSchema = z.object({});
const loadWalletSchema = z.object({
  publicKey: z.string().describe('Public key of the wallet to load as active'),
});

/**
 * MCP Server configuration
 */
export interface MoltPayMcpServerConfig {
  encryptionKey?: string;
  rpcEndpoint?: string;
  network?: 'devnet' | 'mainnet-beta';
}

/**
 * MCP Tool call content
 */
interface McpToolCallContent {
  type: 'text';
  text: string;
}

/**
 * MCP Tool call result
 */
interface McpToolCallResult {
  content: McpToolCallContent[];
  isError?: boolean;
}

/**
 * MCP JSON-RPC message
 */
interface McpMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * MoltPay MCP Server
 *
 * Exposes MoltPay payment tools via the Model Context Protocol.
 * Supports stdio transport for use with MCP clients like Claude Desktop.
 */
export class MoltPayMcpServer extends EventEmitter {
  private moltpay: MoltPayTool;
  private config: MoltPayMcpServerConfig;
  private walletStore: WalletStore;
  private encryptionKey: string;
  private initialized: boolean = false;

  constructor(config: MoltPayMcpServerConfig = {}) {
    super();
    this.config = config;

    const encryptionKey = config.encryptionKey || process.env.MOLTPAY_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('MOLTPAY_ENCRYPTION_KEY environment variable or encryptionKey config required');
    }
    this.encryptionKey = encryptionKey;

    this.moltpay = createMoltPayTool({
      encryptionKey,
      rpcEndpoint: config.rpcEndpoint || process.env.MOLTPAY_RPC_ENDPOINT,
      network: (config.network || process.env.MOLTPAY_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta',
    });

    // Initialize wallet store for persistence
    this.walletStore = new WalletStore();

    // Auto-load most recent wallet if available
    const latestWallet = this.walletStore.getLatestWallet();
    if (latestWallet) {
      this.loadWalletFromStore(latestWallet);
    }
  }

  /**
   * Load a wallet from the store and set it as active
   */
  private loadWalletFromStore(stored: StoredWallet): void {
    this.moltpay.setActiveWallet({
      publicKey: stored.publicKey,
      encryptedPrivateKey: stored.encryptedPrivateKey,
      iv: stored.iv,
      salt: stored.salt,
      createdAt: stored.createdAt,
    });
  }

  /**
   * Start the MCP server with stdio transport
   */
  async startStdio(): Promise<void> {
    process.stdin.setEncoding('utf8');

    let buffer = '';

    process.stdin.on('data', async (chunk: string) => {
      buffer += chunk;

      // Process complete JSON-RPC messages (newline-delimited)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line) as McpMessage;
            const response = await this.handleMessage(message);
            if (response) {
              this.sendResponse(response);
            }
          } catch (error) {
            this.sendResponse({
              jsonrpc: '2.0',
              id: undefined,
              error: {
                code: -32700,
                message: 'Parse error',
                data: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }
      }
    });

    process.stdin.on('end', () => {
      process.exit(0);
    });

    // Log server startup to stderr (not stdout, which is for JSON-RPC)
    process.stderr.write(`MoltPay MCP Server started (network: ${this.config.network || 'devnet'})\n`);
  }

  /**
   * Send JSON-RPC response via stdout
   */
  private sendResponse(message: McpMessage): void {
    process.stdout.write(JSON.stringify(message) + '\n');
  }

  /**
   * Handle incoming MCP message
   */
  private async handleMessage(message: McpMessage): Promise<McpMessage | null> {
    // Handle notifications (no id, no response expected)
    if (message.id === undefined && message.method) {
      await this.handleNotification(message.method, message.params);
      return null;
    }

    // Handle requests
    if (message.method) {
      try {
        const result = await this.handleRequest(message.method, message.params);
        return {
          jsonrpc: '2.0',
          id: message.id,
          result,
        };
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    return null;
  }

  /**
   * Handle MCP notification
   */
  private async handleNotification(method: string, _params?: Record<string, unknown>): Promise<void> {
    switch (method) {
      case 'notifications/initialized':
        this.initialized = true;
        this.emit('initialized');
        break;
      case 'notifications/cancelled':
        // Handle cancellation if needed
        break;
      default:
        // Unknown notification, ignore
        break;
    }
  }

  /**
   * Handle MCP request
   */
  private async handleRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.handleInitialize(params);

      case 'tools/list':
        return this.handleToolsList();

      case 'tools/call':
        return this.handleToolCall(params);

      case 'ping':
        return {};

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(_params?: Record<string, unknown>): {
    protocolVersion: string;
    capabilities: {
      tools: Record<string, never>;
    };
    serverInfo: {
      name: string;
      version: string;
    };
  } {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'moltpay',
        version: '0.1.0',
      },
    };
  }

  /**
   * Handle tools/list request
   */
  private handleToolsList(): {
    tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
  } {
    // Add wallet management tools to the list
    const walletTools = [
      {
        name: 'list_wallets',
        description: 'List all stored wallets. Returns public keys and creation dates of persisted wallets.',
        inputSchema: zodToJsonSchema(listWalletsSchema),
      },
      {
        name: 'load_wallet',
        description: 'Load a previously created wallet as the active wallet for sending payments.',
        inputSchema: zodToJsonSchema(loadWalletSchema),
      },
    ];

    return {
      tools: [
        ...MOLTPAY_MCP_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: zodToJsonSchema(tool.inputSchema),
        })),
        ...walletTools,
      ],
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolCall(params?: Record<string, unknown>): Promise<McpToolCallResult> {
    if (!params || typeof params.name !== 'string') {
      return {
        content: [{ type: 'text', text: 'Invalid tool call: missing tool name' }],
        isError: true,
      };
    }

    const toolName = params.name;
    const args = (params.arguments || {}) as Record<string, unknown>;

    try {
      const result = await this.executeTool(toolName, args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Execute a tool by name
   */
  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'create_wallet': {
        // Create wallet and persist it
        const wallet = await this.moltpay.createWallet();

        // Get the full wallet data including encrypted key
        const activeWallet = this.moltpay.getActiveWallet();

        if (activeWallet) {
          this.walletStore.addWallet({
            publicKey: activeWallet.publicKey,
            encryptedPrivateKey: activeWallet.encryptedPrivateKey,
            iv: activeWallet.iv,
            salt: activeWallet.salt,
            createdAt: activeWallet.createdAt,
          });
        }

        return {
          ...wallet,
          persisted: true,
          walletCount: this.walletStore.getCount(),
        };
      }

      case 'list_wallets': {
        const wallets = this.walletStore.listWallets();
        return {
          wallets: wallets.map(w => ({
            publicKey: w.publicKey,
            createdAt: w.createdAt,
            label: w.label,
          })),
          count: wallets.length,
        };
      }

      case 'load_wallet': {
        const parsed = loadWalletSchema.parse(args);
        const stored = this.walletStore.getWallet(parsed.publicKey);

        if (!stored) {
          throw new Error(`Wallet not found: ${parsed.publicKey}`);
        }

        this.loadWalletFromStore(stored);

        return {
          success: true,
          publicKey: stored.publicKey,
          createdAt: stored.createdAt,
          message: 'Wallet loaded as active. Ready to send payments.',
        };
      }

      case 'get_balance': {
        const parsed = getBalanceSchema.parse(args);
        return this.moltpay.getBalance(parsed);
      }

      case 'send_payment': {
        const parsed = sendPaymentSchema.parse(args);
        return this.moltpay.sendPayment({
          to: parsed.to,
          amount: parsed.amount,
          token: parsed.token,
          memo: parsed.memo,
        });
      }

      case 'verify_payment': {
        const parsed = verifyPaymentSchema.parse(args);
        return this.moltpay.verifyPayment(parsed);
      }

      case 'get_history': {
        const parsed = getHistorySchema.parse(args);
        return this.moltpay.getTransactionHistory(parsed);
      }

      case 'request_airdrop': {
        const parsed = requestAirdropSchema.parse(args);
        return this.moltpay.requestAirdrop(parsed);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Get the underlying MoltPayTool instance
   */
  getMoltPayTool(): MoltPayTool {
    return this.moltpay;
  }

  /**
   * Check if server is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Create and start an MCP server instance
 */
export async function startMcpServer(config?: MoltPayMcpServerConfig): Promise<MoltPayMcpServer> {
  const server = new MoltPayMcpServer(config);
  await server.startStdio();
  return server;
}
