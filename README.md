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
import { MoltPayTool } from 'moltpay/langchain';

const paymentTool = new MoltPayTool({
  encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY,
});

// Use with LangChain agent
const tools = [paymentTool];
```

### MCP Server

```typescript
import { MoltPayMcpServer } from 'moltpay/mcp';

const server = new MoltPayMcpServer({
  encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY,
});

server.start();
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

## License

MIT
