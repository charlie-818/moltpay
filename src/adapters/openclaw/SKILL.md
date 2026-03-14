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

### \`create_wallet\`
Create a new encrypted Solana wallet for the agent.

**Returns:**
- \`publicKey\`: The wallet's public address
- \`encrypted\`: Whether the wallet is encrypted at rest

### \`get_balance\`
Check the SOL balance of a wallet address.

**Parameters:**
- \`address\` (optional): Wallet address to check. Defaults to agent's wallet.

**Returns:**
- \`balance\`: Balance in SOL
- \`lamports\`: Balance in lamports (1 SOL = 1,000,000,000 lamports)

### \`send\`
Send SOL to a recipient address.

**Parameters:**
- \`to\`: Recipient wallet address
- \`amount\`: Amount of SOL to send
- \`memo\` (optional): Transaction memo

**Returns:**
- \`signature\`: Transaction signature
- \`status\`: "confirmed" | "finalized"

### \`verify_payment\`
Verify that a payment was received.

**Parameters:**
- \`signature\`: Transaction signature to verify
- \`expectedAmount\` (optional): Expected amount in SOL
- \`expectedSender\` (optional): Expected sender address

**Returns:**
- \`verified\`: boolean
- \`amount\`: Actual amount transferred
- \`sender\`: Sender address
- \`recipient\`: Recipient address
- \`timestamp\`: Transaction timestamp

### \`get_transaction\`
Get details of a specific transaction.

**Parameters:**
- \`signature\`: Transaction signature

**Returns:**
- Full transaction details including status, amount, parties, and timestamp

## Example Usage

\`\`\`
User: Create a wallet for payments

Agent: I'll create a new Solana wallet for you.
[Calls create_wallet]

Wallet created successfully!
- Public Key: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
- Network: Devnet
- Encrypted: Yes

Your wallet is ready to receive SOL. Would you like me to check the balance?
\`\`\`

\`\`\`
User: Send 0.5 SOL to 9aE476sH92...

Agent: I'll send 0.5 SOL to that address.
[Calls send with to="9aE476sH92...", amount=0.5]

Transaction submitted!
- Amount: 0.5 SOL
- Recipient: 9aE476sH92...
- Signature: 5K8d7nR3...
- Status: Confirmed

View on Solscan: https://solscan.io/tx/5K8d7nR3...
\`\`\`

## Security

- Private keys are encrypted at rest using your \`MOLTPAY_ENCRYPTION_KEY\`
- Transactions require explicit agent approval before signing
- Supports both Devnet (testing) and Mainnet (production)
- All operations are logged for audit purposes

## Configuration

Set these environment variables:

- \`MOLTPAY_ENCRYPTION_KEY\`: Required. Key for encrypting wallet data
- \`MOLTPAY_RPC_ENDPOINT\`: Optional. Custom RPC endpoint (defaults to Devnet)
- \`MOLTPAY_NETWORK\`: Optional. "devnet" | "mainnet-beta" (defaults to "devnet")
