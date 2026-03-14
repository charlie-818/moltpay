# MoltPay

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![Solana](https://img.shields.io/badge/Solana-Powered-purple.svg)](https://solana.com/)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-Compatible-orange.svg)](https://openclaw.dev/)

> A payment SDK enabling AI agents to transact value on Solana with enterprise-grade security and multi-framework support.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MoltPay SDK                          │
├─────────────────────────────────────────────────────────────┤
│  Agent Framework Adapters                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ OpenClaw │ │ LangChain│ │  CrewAI  │ │   MCP    │       │
│  │  Skill   │ │   Tool   │ │   Tool   │ │  Server  │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       └────────────┴────────────┴────────────┘              │
│                          │                                  │
│  ┌───────────────────────▼──────────────────────────┐      │
│  │              Core Payment Engine                  │      │
│  │  WalletManager │ TransactionBuilder │ Verifier   │      │
│  └───────────────────────┬──────────────────────────┘      │
│                          │                                  │
│  ┌───────────────────────▼──────────────────────────┐      │
│  │              Security Layer                       │      │
│  │  Encryption │ RateLimiter │ FraudDetection       │      │
│  └───────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Wallet Management** - Create, encrypt, and manage Solana wallets programmatically
- **Token Transfers** - Send SOL and SPL tokens with transaction verification
- **Multi-Framework Support** - Native adapters for OpenClaw, LangChain, CrewAI, and MCP
- **Enterprise Security** - AES-256-GCM encryption, rate limiting, and fraud detection
- **Permission System** - Granular scopes for file, network, wallet, and system access
- **Audit Logging** - Complete transaction history with tamper-evident records

## Quick Start

### For Developers

```typescript
import { MoltPay } from 'moltpay';

const moltpay = new MoltPay({
  encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY,
  rpcEndpoint: 'https://api.devnet.solana.com'
});

// Create wallet
const wallet = moltpay.wallet.createWallet();
console.log('Address:', wallet.publicKey);

// Send SOL
const keypair = moltpay.wallet.decryptWallet(wallet);
const tx = await moltpay.transactions.buildTransfer({
  sender: keypair,
  recipient: 'RecipientPublicKeyHere',
  amount: 1.0,
  token: 'SOL',
});
const result = await moltpay.sender.signSendAndConfirm(tx.transaction, [keypair]);
console.log('Signature:', result.signature);
```

### For AI Agents

Create a `SKILL.md` file in your project:

```yaml
---
name: moltpay
description: Process Solana payments securely
version: 1.0.0
permissions:
  - wallet_read
  - wallet_sign
  - wallet_send
trust-level: verified
---

## Payment Skill

This skill enables AI agents to process Solana payments.

### Actions
- `create_wallet` - Create new wallet
- `send` - Send SOL or tokens
- `verify_payment` - Verify transaction
```

## Installation

```bash
npm install moltpay
```

### Environment Setup

```bash
# Required
MOLTPAY_ENCRYPTION_KEY=your-32-byte-encryption-key

# Optional
MOLTPAY_RPC_ENDPOINT=https://api.devnet.solana.com
MOLTPAY_RATE_LIMIT=100
```

## API Reference

### MoltPay

```typescript
const moltpay = new MoltPay(config: MoltPayConfig);
```

| Property | Description |
|----------|-------------|
| `moltpay.wallet` | Wallet management operations |
| `moltpay.transactions` | Transaction building utilities |
| `moltpay.sender` | Transaction signing and sending |
| `moltpay.verifier` | Payment verification |

### Wallet Operations

```typescript
// Create encrypted wallet
const wallet = moltpay.wallet.createWallet();

// Decrypt wallet for signing
const keypair = moltpay.wallet.decryptWallet(wallet);

// Get balance
const balance = await moltpay.wallet.getBalance(publicKey);

// Request airdrop (devnet only)
await moltpay.wallet.requestAirdrop(publicKey, 2);
```

### Transaction Operations

```typescript
// Build transfer
const tx = await moltpay.transactions.buildTransfer({
  sender: keypair,
  recipient: publicKey,
  amount: 1.0,
  token: 'SOL',
  memo: 'Payment for services'
});

// Sign, send, and confirm
const result = await moltpay.sender.signSendAndConfirm(
  tx.transaction,
  [keypair]
);

// Verify payment
const verified = await moltpay.verifier.verifyPayment(result.signature);
```

## Permission Scopes

| Scope | Description | Risk Level |
|-------|-------------|------------|
| `file_read` | Read files from filesystem | Low |
| `file_write` | Write files to filesystem | Medium |
| `network_fetch` | Make HTTP requests | Medium |
| `network_connect` | WebSocket connections | Medium |
| `wallet_read` | View wallet balance and history | Low |
| `wallet_sign` | Sign transactions | High |
| `wallet_send` | Send funds from wallet | High |
| `system_exec` | Execute system commands | High |

## Examples

### Complete Payment Flow

```typescript
import { MoltPay } from 'moltpay';
import { PublicKey } from '@solana/web3.js';

async function processPayment() {
  const moltpay = new MoltPay({
    encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY,
  });

  // Create sender wallet
  const senderWallet = moltpay.wallet.createWallet();
  console.log('Sender:', senderWallet.publicKey);

  // Get airdrop for testing (devnet)
  await moltpay.wallet.requestAirdrop(senderWallet.publicKey, 2);

  // Wait for airdrop confirmation
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Build and send transfer
  const keypair = moltpay.wallet.decryptWallet(senderWallet);
  const recipient = new PublicKey('RecipientAddressHere');

  const tx = await moltpay.transactions.buildTransfer({
    sender: keypair,
    recipient,
    amount: 1.0,
    token: 'SOL',
    memo: 'Test payment'
  });

  const result = await moltpay.sender.signSendAndConfirm(
    tx.transaction,
    [keypair]
  );

  console.log('Transaction:', result.signature);

  // Verify the payment
  const verified = await moltpay.verifier.verifyPayment(result.signature);
  console.log('Verified:', verified.success);
}

processPayment();
```

### LangChain Integration

```typescript
import { createMoltPayTool, MOLTPAY_TOOL_SCHEMAS } from 'moltpay';

const moltpay = createMoltPayTool({
  encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY,
  network: 'devnet',
});

// Create wallet
const result = await moltpay.createWallet();
console.log('Wallet:', result.publicKey);

// Send payment
const payment = await moltpay.sendPayment({
  to: 'recipient-public-key',
  amount: 0.1,
  token: 'SOL',
});
```

### CrewAI Integration

```typescript
import { createCrewAITool, CREWAI_TOOL_SCHEMAS } from 'moltpay';

const moltpay = createCrewAITool({
  encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY,
  network: 'devnet',
});

// All outputs are JSON strings for Python compatibility
const walletJson = await moltpay.createWallet();
const wallet = JSON.parse(walletJson);

// Get tool functions for CrewAI
const tools = moltpay.getToolFunctions();
const balanceJson = await tools.moltpay_get_balance(
  JSON.stringify({ publicKey: wallet.data.publicKey })
);
```

**Python CrewAI Example:**

```python
from crewai_tools import Tool
import subprocess
import json

def moltpay_create_wallet():
    result = subprocess.run(
        ['npx', 'moltpay', 'create-wallet'],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)

wallet_tool = Tool(
    name="moltpay_create_wallet",
    description="Create a new Solana wallet",
    func=moltpay_create_wallet
)
```

### REST API Server

```typescript
import { createApiServer, startApiServer } from 'moltpay';

const app = createApiServer({
  encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY,
  network: 'devnet',
  apiKey: process.env.API_KEY,
  port: 3000,
});

startApiServer(app, 3000);
```

**API Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/wallet` | Create a new wallet |
| `GET` | `/api/wallet/:address/balance` | Get wallet balance |
| `POST` | `/api/transaction/send` | Send SOL or tokens |
| `POST` | `/api/transaction/verify` | Verify a payment |
| `POST` | `/api/airdrop` | Request airdrop (devnet) |
| `GET` | `/api/history/:address` | Get transaction history |

**Example API Request:**

```bash
# Create a wallet
curl -X POST http://localhost:3000/api/wallet \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json"

# Send payment
curl -X POST http://localhost:3000/api/transaction/send \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"to": "recipient-address", "amount": 0.1, "token": "SOL"}'
```

### OpenClaw Integration

```typescript
import { createMoltPaySkill } from 'moltpay';

const skill = createMoltPaySkill({
  encryption_key: process.env.MOLTPAY_ENCRYPTION_KEY,
  network: 'devnet',
});

// Execute actions
const result = await skill.execute({
  action: 'create_wallet',
  params: {},
});
```

### MCP Integration

```typescript
import { createMcpManager } from 'moltpay';

const mcpManager = createMcpManager();

mcpManager.addServer({
  id: 'payment-tools',
  name: 'Payment Tools',
  transport: 'stdio',
  command: 'node',
  args: ['mcp-server.js'],
  trustLevel: 'verified',
});

const client = await mcpManager.connect('payment-tools');
const result = await client.callTool('send_payment', { to: '...', amount: 1 });
```

## MCP Server

MoltPay includes a built-in MCP server that exposes Solana payment tools to MCP clients like Claude Desktop, Claude Code, and other compatible applications.

### Quick Start

```bash
# Install and run directly
npx moltpay-mcp

# Or with environment variables
MOLTPAY_ENCRYPTION_KEY=your-secret-key MOLTPAY_NETWORK=devnet npx moltpay-mcp
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "moltpay": {
      "command": "npx",
      "args": ["moltpay-mcp"],
      "env": {
        "MOLTPAY_ENCRYPTION_KEY": "your-32-byte-encryption-key",
        "MOLTPAY_NETWORK": "devnet"
      }
    }
  }
}
```

### Claude Code Configuration

Add to your `.claude/settings.json` or global settings:

```json
{
  "mcpServers": {
    "moltpay": {
      "command": "npx",
      "args": ["moltpay-mcp"],
      "env": {
        "MOLTPAY_ENCRYPTION_KEY": "${env:MOLTPAY_ENCRYPTION_KEY}",
        "MOLTPAY_NETWORK": "devnet"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `create_wallet` | Create a new Solana wallet with encrypted storage | none |
| `get_balance` | Get SOL and token balances for a wallet | `publicKey`, `tokens?` |
| `send_payment` | Send SOL or SPL tokens to a recipient | `to`, `amount`, `token?`, `memo?` |
| `verify_payment` | Verify a transaction on the blockchain | `signature`, `expectedRecipient?`, `expectedAmount?` |
| `get_history` | Get transaction history for a wallet | `publicKey`, `limit?`, `direction?` |
| `request_airdrop` | Request devnet SOL airdrop (devnet only) | `publicKey`, `amount?` |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MOLTPAY_ENCRYPTION_KEY` | Yes | 32-byte key for wallet encryption |
| `MOLTPAY_NETWORK` | No | `devnet` (default) or `mainnet-beta` |
| `MOLTPAY_RPC_ENDPOINT` | No | Custom Solana RPC endpoint URL |

### Example Usage in Claude

Once configured, you can use MoltPay tools directly in Claude:

```
Human: Create a new Solana wallet for me

Claude: I'll create a new Solana wallet for you using the MoltPay tools.
[Uses create_wallet tool]

Your new wallet has been created:
- Public Key: 7xKXtg2CW...
- Created at: 2024-01-15T10:30:00Z
```

## Security

- All wallet private keys are encrypted with AES-256-GCM
- Encryption keys should be stored securely (environment variables, secret managers)
- Rate limiting prevents abuse and protects against flooding attacks
- Fraud detection monitors for suspicious transaction patterns
- Never commit encryption keys or wallet files to version control

### Security Best Practices

1. Use environment variables for sensitive configuration
2. Enable rate limiting in production
3. Implement proper error handling to avoid leaking sensitive data
4. Regularly rotate encryption keys
5. Use hardware wallets for high-value accounts

## Project Structure

```
moltpay/
├── src/
│   ├── bin/              # CLI entry points (moltpay-mcp)
│   ├── wallet/           # Wallet management
│   ├── transaction/      # Transaction building & sending
│   ├── receipt/          # Payment verification & receipts
│   ├── security/         # Rate limiting, fraud detection
│   ├── skills/           # Skills system
│   ├── mcp/              # MCP client and server
│   ├── payments/         # Payment & license management
│   ├── adapters/
│   │   ├── langchain/    # LangChain adapter
│   │   ├── openclaw/     # OpenClaw adapter
│   │   ├── crewai/       # CrewAI adapter
│   │   └── api/          # REST API adapter
│   └── ui/               # React components
├── tests/                # Test files
└── examples/             # Usage examples
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Build
npm run build

# Run in development
npm run dev
```

## License

MIT
