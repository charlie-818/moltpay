#!/usr/bin/env node
/**
 * MoltPay MCP Server CLI
 *
 * Starts the MoltPay MCP server with stdio transport.
 *
 * Usage:
 *   npx moltpay-mcp
 *
 * Environment variables:
 *   MOLTPAY_ENCRYPTION_KEY - Required. 32-byte encryption key for wallet security.
 *   MOLTPAY_NETWORK        - Optional. Network to use: 'devnet' or 'mainnet-beta'. Default: 'devnet'
 *   MOLTPAY_RPC_ENDPOINT   - Optional. Custom Solana RPC endpoint URL.
 *
 * Example:
 *   MOLTPAY_ENCRYPTION_KEY=your-secret-key npx moltpay-mcp
 */

import { startMcpServer } from '../mcp/McpServer';

async function main(): Promise<void> {
  // Check for required environment variables
  const encryptionKey = process.env.MOLTPAY_ENCRYPTION_KEY;

  if (!encryptionKey) {
    process.stderr.write(`
Error: MOLTPAY_ENCRYPTION_KEY environment variable is required.

Usage:
  MOLTPAY_ENCRYPTION_KEY=your-key npx moltpay-mcp

For Claude Desktop, configure in claude_desktop_config.json:
  {
    "mcpServers": {
      "moltpay": {
        "command": "npx",
        "args": ["moltpay-mcp"],
        "env": {
          "MOLTPAY_ENCRYPTION_KEY": "your-encryption-key",
          "MOLTPAY_NETWORK": "devnet"
        }
      }
    }
  }

For Claude Code, configure in .claude/settings.json:
  {
    "mcpServers": {
      "moltpay": {
        "command": "npx",
        "args": ["moltpay-mcp"],
        "env": {
          "MOLTPAY_ENCRYPTION_KEY": "\${env:MOLTPAY_ENCRYPTION_KEY}"
        }
      }
    }
  }

`);
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const showHelp = args.includes('--help') || args.includes('-h');
  const showVersion = args.includes('--version') || args.includes('-v');

  if (showHelp) {
    process.stderr.write(`
MoltPay MCP Server - Solana payment tools for AI agents

Usage:
  npx moltpay-mcp [options]

Options:
  --help, -h      Show this help message
  --version, -v   Show version information

Environment Variables:
  MOLTPAY_ENCRYPTION_KEY   Required. Encryption key for wallet security.
  MOLTPAY_NETWORK          Network: 'devnet' or 'mainnet-beta' (default: devnet)
  MOLTPAY_RPC_ENDPOINT     Custom Solana RPC endpoint URL.

Available Tools:
  create_wallet     Create a new Solana wallet
  get_balance       Get wallet SOL and token balances
  send_payment      Send SOL or SPL tokens
  verify_payment    Verify a transaction on-chain
  get_history       Get transaction history
  request_airdrop   Request devnet SOL airdrop

Examples:
  # Start server with devnet
  MOLTPAY_ENCRYPTION_KEY=secret npx moltpay-mcp

  # Start server with mainnet
  MOLTPAY_ENCRYPTION_KEY=secret MOLTPAY_NETWORK=mainnet-beta npx moltpay-mcp

`);
    process.exit(0);
  }

  if (showVersion) {
    process.stderr.write('moltpay-mcp 0.1.0\n');
    process.exit(0);
  }

  // Start the MCP server
  try {
    const server = await startMcpServer({
      encryptionKey,
      network: (process.env.MOLTPAY_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta',
      rpcEndpoint: process.env.MOLTPAY_RPC_ENDPOINT,
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      process.stderr.write('\nShutting down MoltPay MCP Server...\n');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      process.stderr.write('\nShutting down MoltPay MCP Server...\n');
      process.exit(0);
    });

  } catch (error) {
    process.stderr.write(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
