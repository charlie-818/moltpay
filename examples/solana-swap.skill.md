---
name: solana-swap
description: Execute token swaps on Jupiter and Raydium DEXes with optimal routing
version: 1.0.0
license: MIT
author: moltpay
allowed-tools: Bash Read WebFetch
tags:
  - solana
  - defi
  - swap
  - jupiter
  - trading
pricing:
  model: usage
  amount: 0.001
  currency: SOL
permissions:
  - wallet_read
  - wallet_sign
  - network_fetch:api.jup.ag
  - network_fetch:api.raydium.io
trust-level: verified
---

## Solana Token Swap Skill

This skill enables AI agents to execute token swaps on Solana using Jupiter and Raydium DEX aggregators.

### Capabilities

1. **Quote Fetching**: Get real-time swap quotes from Jupiter aggregator
2. **Route Optimization**: Automatically find the best route across multiple DEXes
3. **Transaction Building**: Create optimized swap transactions
4. **Execution**: Sign and submit transactions to the network

### Usage

When a user requests a token swap (e.g., "Swap 1 SOL for USDC"), follow these steps:

1. **Fetch Quote**
   - Call Jupiter API to get the best swap route
   - Display the expected output amount and price impact

2. **Confirm with User**
   - Show the swap details including:
     - Input amount and token
     - Expected output amount
     - Price impact percentage
     - Estimated fees

3. **Execute Swap**
   - Build the transaction using the quote
   - Request wallet signature
   - Submit to Solana network
   - Wait for confirmation

### Example Interaction

```
User: Swap 1 SOL for USDC

Agent: I'll help you swap 1 SOL for USDC. Let me fetch the current rates...

Quote received:
- Input: 1 SOL
- Output: ~150.25 USDC
- Price Impact: 0.01%
- Route: SOL → USDC via Orca

Would you like to proceed with this swap?

User: Yes

Agent: Creating swap transaction...
Transaction requires wallet signature.
[Wallet signature requested]

Transaction submitted: 5K8d7...
Waiting for confirmation...

Swap complete!
- Sent: 1 SOL
- Received: 150.23 USDC
- Transaction: https://solscan.io/tx/5K8d7...
```

### API Endpoints Used

- Jupiter Quote API: `https://api.jup.ag/quote`
- Jupiter Swap API: `https://api.jup.ag/swap`
- Raydium API: `https://api.raydium.io/v2/main/pairs`

### Security Considerations

- Always show swap details before execution
- Require explicit user confirmation for swaps
- Display price impact warnings for high slippage
- Never execute swaps without user approval
