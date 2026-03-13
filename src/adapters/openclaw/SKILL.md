# MoltPay Skill

Solana payment processing for AI agents. Send SOL and SPL tokens, verify payments, and manage wallets on the Solana blockchain.

## Configuration

```yaml
name: moltpay
version: 1.0.0
description: Solana payment processing for AI agents
author: MoltPay
category: finance
tags:
  - payments
  - solana
  - cryptocurrency
  - blockchain
  - web3

settings:
  encryption_key:
    type: string
    required: true
    secret: true
    description: Encryption key for wallet security (min 8 characters)

  rpc_endpoint:
    type: string
    required: false
    default: https://api.devnet.solana.com
    description: Solana RPC endpoint URL

  network:
    type: string
    required: false
    default: devnet
    enum: [devnet, mainnet-beta]
    description: Solana network to use
```

## Actions

### create_wallet
Creates a new Solana wallet with encrypted private key storage.

**Parameters:**
- None required

**Returns:**
```json
{
  "publicKey": "Base58 public key",
  "encryptedPrivateKey": "Encrypted private key (base64)",
  "createdAt": 1234567890
}
```

### create_hd_wallet
Creates a new HD wallet with BIP39 mnemonic for key recovery.

**Parameters:**
- `accountIndex` (number, optional): Account derivation index (default: 0)

**Returns:**
```json
{
  "publicKey": "Base58 public key",
  "mnemonic": "12-word recovery phrase",
  "derivationPath": "m/44'/501'/0'/0'"
}
```

### get_balance
Gets the SOL and token balance for a wallet.

**Parameters:**
- `publicKey` (string, required): Wallet public key
- `tokens` (array, optional): Token mints to check (e.g., ["USDC", "USDT"])

**Returns:**
```json
{
  "sol": 1.5,
  "tokens": [
    { "symbol": "USDC", "amount": 100.0 }
  ]
}
```

### send
Sends SOL or SPL tokens to a recipient.

**Parameters:**
- `to` (string, required): Recipient public key
- `amount` (number, required): Amount to send
- `token` (string, optional): Token to send (default: "SOL")
- `memo` (string, optional): Transaction memo

**Returns:**
```json
{
  "signature": "Transaction signature",
  "status": "confirmed",
  "timestamp": 1234567890,
  "receipt": {
    "receiptId": "RCP-12345678",
    "amount": 1.5,
    "token": "SOL"
  }
}
```

### verify_payment
Verifies a payment was received on-chain.

**Parameters:**
- `signature` (string, required): Transaction signature to verify
- `expectedRecipient` (string, optional): Expected recipient address
- `expectedAmount` (number, optional): Expected amount
- `expectedToken` (string, optional): Expected token

**Returns:**
```json
{
  "verified": true,
  "receipt": {
    "receiptId": "RCP-12345678",
    "from": "sender address",
    "to": "recipient address",
    "amount": 1.5,
    "token": "SOL",
    "timestamp": 1234567890
  }
}
```

### get_history
Gets transaction history for a wallet.

**Parameters:**
- `publicKey` (string, required): Wallet public key
- `limit` (number, optional): Max transactions to return (default: 10)
- `direction` (string, optional): Filter by "sent", "received", or "all"

**Returns:**
```json
{
  "transactions": [
    {
      "signature": "...",
      "from": "...",
      "to": "...",
      "amount": 1.5,
      "token": "SOL",
      "timestamp": 1234567890,
      "status": "success"
    }
  ]
}
```

### request_airdrop
Requests test SOL on devnet (for testing only).

**Parameters:**
- `publicKey` (string, required): Wallet public key
- `amount` (number, optional): Amount in SOL (max 2, default: 1)

**Returns:**
```json
{
  "signature": "Airdrop transaction signature",
  "amount": 1.0
}
```

## Usage Examples

### Creating a wallet and sending payment
```
Agent: I'll create a new wallet for you.
[calls create_wallet]

Agent: Your wallet is ready! Public key: 7xKX...
To send 0.5 SOL to another wallet:
[calls send with to="recipient", amount=0.5]

Agent: Payment sent! Transaction signature: 5nT2...
```

### Verifying a received payment
```
Agent: Let me verify that payment.
[calls verify_payment with signature="5nT2..."]

Agent: Payment verified! Receipt ID: RCP-12345678
Amount: 1.5 SOL from 8vKX... to 7xKX...
```

## Security Notes

- Private keys are encrypted with AES-256 before storage
- Never log or expose private keys or mnemonics
- Rate limiting is applied to prevent abuse
- Transaction amounts are monitored for anomalies
- Currently configured for devnet only

## Error Handling

All actions return errors in this format:
```json
{
  "success": false,
  "error": "Error description"
}
```

Common errors:
- `INSUFFICIENT_BALANCE`: Not enough SOL/tokens for transaction
- `INVALID_ADDRESS`: Invalid public key format
- `TRANSACTION_FAILED`: Transaction rejected by network
- `RATE_LIMITED`: Too many transactions, try again later
