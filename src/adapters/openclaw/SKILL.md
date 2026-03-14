---
name: moltpay
description: Solana payment skill for AI agents - create wallets, send SOL, and verify transactions
version: 0.1.0
license: MIT
author: MoltPay
allowed-tools: Bash Read WebFetch
tags:
  - solana
  - payments
  - wallet
  - ai-agents
  - mcp
pricing:
  model: free
  currency: SOL
permissions:
  - wallet_create
  - wallet_read
  - wallet_sign
  - network_fetch:api.mainnet-beta.solana.com
  - network_fetch:api.devnet.solana.com
trust-level: verified
certifications:
  - AIUC-1
---

# MoltPay - Solana Payments for AI Agents

MoltPay enables AI agents to create Solana wallets, check balances, send SOL payments, and verify transactions on-chain.

## Available Tools

### `create_wallet`
Create a new encrypted Solana wallet for the agent.

**Returns:**
- `publicKey`: The wallet's public address
- `encrypted`: Whether the wallet is encrypted at rest

### `get_balance`
Check the SOL balance of a wallet address.

**Parameters:**
- `address` (optional): Wallet address to check. Defaults to agent's wallet.

**Returns:**
- `balance`: Balance in SOL
- `lamports`: Balance in lamports (1 SOL = 1,000,000,000 lamports)

### `send`
Send SOL to a recipient address.

**Parameters:**
- `to`: Recipient wallet address
- `amount`: Amount of SOL to send
- `memo` (optional): Transaction memo

**Returns:**
- `signature`: Transaction signature
- `status`: "confirmed" | "finalized"

### `verify_payment`
Verify that a payment was received.

**Parameters:**
- `signature`: Transaction signature to verify
- `expectedAmount` (optional): Expected amount in SOL
- `expectedSender` (optional): Expected sender address

**Returns:**
- `verified`: boolean
- `amount`: Actual amount transferred
- `sender`: Sender address
- `recipient`: Recipient address
- `timestamp`: Transaction timestamp

### `get_transaction`
Get details of a specific transaction.

**Parameters:**
- `signature`: Transaction signature

**Returns:**
- Full transaction details including status, amount, parties, and timestamp

## Example Usage

```
User: Create a wallet for payments

Agent: I'll create a new Solana wallet for you.
[Calls create_wallet]

Wallet created successfully!
- Public Key: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
- Network: Devnet
- Encrypted: Yes

Your wallet is ready to receive SOL. Would you like me to check the balance?
```

```
User: Send 0.5 SOL to 9aE476sH92...

Agent: I'll send 0.5 SOL to that address.
[Calls send with to="9aE476sH92...", amount=0.5]

Transaction submitted!
- Amount: 0.5 SOL
- Recipient: 9aE476sH92...
- Signature: 5K8d7nR3...
- Status: Confirmed

View on Solscan: https://solscan.io/tx/5K8d7nR3...
```

## Security

- Private keys are encrypted at rest using your `MOLTPAY_ENCRYPTION_KEY`
- Transactions require explicit agent approval before signing
- Supports both Devnet (testing) and Mainnet (production)
- All operations are logged for audit purposes

## Configuration

Set these environment variables:

- `MOLTPAY_ENCRYPTION_KEY`: Required. Key for encrypting wallet data
- `MOLTPAY_RPC_ENDPOINT`: Optional. Custom RPC endpoint (defaults to Devnet)
- `MOLTPAY_NETWORK`: Optional. "devnet" | "mainnet-beta" (defaults to "devnet")

---

## OpenClaw Integration Guide

### Installation

#### Method 1: Direct Skill Installation

Place the skill files in your OpenClaw skills directory:

```bash
# Default skills directory
~/.openclaw/skills/moltpay/

# Required files:
~/.openclaw/skills/moltpay/SKILL.md          # This file
~/.openclaw/skills/moltpay/moltpay-skill.ts  # Skill implementation
```

#### Method 2: MCP Server Installation

Add MoltPay to your `claude_desktop_config.json` or OpenClaw MCP configuration:

```json
{
  "mcpServers": {
    "moltpay": {
      "command": "npx",
      "args": ["moltpay-mcp"],
      "env": {
        "MOLTPAY_ENCRYPTION_KEY": "your-secure-encryption-key",
        "MOLTPAY_NETWORK": "devnet"
      }
    }
  }
}
```

#### Method 3: npm Package

```bash
npm install moltpay

# Then register in your OpenClaw plugin config
```

### Skill Registry & Storage

Skills are stored in a SQLite database with the following structure:

- **Location**: `~/.moltpay/skills.db` (configurable)
- **Tables**: `skills` (metadata), `permissions` (granted permissions)
- **Full-text search**: Enabled on name, description, and tags

To manually register the skill:

```typescript
import { SkillManager } from 'moltpay';

const manager = new SkillManager();
await manager.installFromFile('./SKILL.md');
```

### Heartbeat & Health Checks

OpenClaw uses MCP ping for heartbeat checks. The MoltPay MCP server responds to:

| Method | Description |
|--------|-------------|
| `ping` | Returns `{}` - confirms server is alive |
| `initialize` | Handshake with protocol version and capabilities |
| `notifications/initialized` | Client confirms ready state |

**Health Check Example:**
```json
// Request
{"jsonrpc": "2.0", "id": 1, "method": "ping"}

// Response
{"jsonrpc": "2.0", "id": 1, "result": {}}
```

The REST API also provides a `/health` endpoint:
```bash
curl http://localhost:3000/health
# Returns: {"status": "ok", "network": "devnet", "timestamp": "..."}
```

### Skill Discovery & Verification

OpenClaw discovers skills through:

1. **Local Directory Scan**: Watches `~/.openclaw/skills/` for SKILL.md files
2. **MCP Tool Listing**: Queries `tools/list` from registered MCP servers
3. **Marketplace Registry**: Fetches from configured skill marketplaces

**Verification Process:**
- Skills are validated for syntax and security patterns
- Trust level determines autonomy tier:
  - `system` → `autonomous` (full auto-execution)
  - `verified` → `act_confirm` (executes with confirmation)
  - `community` → `plan_propose` (proposes actions only)
  - `untrusted` → `observe_suggest` (read-only suggestions)

### Programmatic Usage

```typescript
import { createMoltPaySkill } from 'moltpay/adapters/openclaw';

const skill = createMoltPaySkill({
  encryption_key: process.env.MOLTPAY_ENCRYPTION_KEY,
  network: 'devnet',
});

// Execute skill actions
const result = await skill.execute({
  action: 'create_wallet',
  params: {},
});

// Direct method calls
const balance = await skill.execute({
  action: 'get_balance',
  params: { publicKey: 'ABC123...' },
});

const payment = await skill.execute({
  action: 'send',
  params: {
    to: 'RecipientPublicKey...',
    amount: 0.5,
    token: 'SOL',
    memo: 'Payment from AI agent',
  },
});
```

### MCP Protocol Integration

The MoltPay MCP server exposes these tools:

| Tool | Description |
|------|-------------|
| `create_wallet` | Create a new encrypted Solana wallet |
| `get_balance` | Query SOL/token balances |
| `send_payment` | Send SOL or SPL tokens |
| `verify_payment` | Verify transaction on-chain |
| `get_history` | Retrieve transaction history |
| `request_airdrop` | Request devnet SOL (devnet only) |
| `list_wallets` | List all stored wallets |
| `load_wallet` | Load a wallet as active |

**MCP Tool Call Example:**
```json
// Request
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_balance",
    "arguments": {}
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{"type": "text", "text": "{\"sol\": 1.5, \"lamports\": 1500000000}"}]
  }
}
```

### Wallet Persistence

Wallets are automatically persisted across sessions:

- **Storage**: `~/.moltpay/wallets.json`
- **Encryption**: Private keys encrypted with `MOLTPAY_ENCRYPTION_KEY`
- **Auto-load**: Most recent wallet loaded on server startup

### Troubleshooting

**Skill not discovered:**
1. Verify SKILL.md is in the correct directory
2. Check file permissions (readable by OpenClaw process)
3. Validate YAML frontmatter syntax

**Heartbeat failing:**
1. Ensure MCP server is running: `npx moltpay-mcp`
2. Check `MOLTPAY_ENCRYPTION_KEY` is set
3. Verify network connectivity

**Permission denied errors:**
1. Check skill trust-level matches required permissions
2. Verify permissions are granted in skill registry
3. Review audit logs at `~/.moltpay/audit.log`
