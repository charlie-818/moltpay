/**
 * LangChain Tool Integration Example
 *
 * Demonstrates how to use MoltPay with LangChain agents
 * for autonomous payment processing.
 */

import { createMoltPayTool, MOLTPAY_TOOL_SCHEMAS } from '../src/adapters/langchain';

async function main() {
  console.log('🦜 MoltPay LangChain Tool Example\n');

  // Show available tool schemas
  console.log('Available Tools:');
  Object.entries(MOLTPAY_TOOL_SCHEMAS).forEach(([key, schema]) => {
    console.log(`  - ${schema.name}: ${schema.description}`);
  });

  // Create the MoltPay tool
  const tool = createMoltPayTool({
    encryptionKey: process.env.MOLTPAY_ENCRYPTION_KEY || 'my-secure-encryption-key',
    network: 'devnet',
  });

  // Get tool functions for LangChain integration
  const toolFunctions = tool.getToolFunctions();
  console.log('\n--- Tool Functions ---');
  console.log(`Registered ${Object.keys(toolFunctions).length} tool functions`);

  // Simulate LangChain agent calling tools
  console.log('\n--- Simulating LangChain Agent ---\n');

  // 1. Create wallet
  console.log('Agent: "Let me create a wallet for you"');
  const wallet = await tool.createWallet();
  console.log(`Tool Result: Wallet created with public key ${wallet.publicKey}`);

  // 2. Request airdrop
  console.log('\nAgent: "Getting some test SOL from the faucet"');
  const airdrop = await tool.requestAirdrop({ publicKey: wallet.publicKey });
  if (airdrop.success) {
    console.log(`Tool Result: Received airdrop, signature: ${airdrop.signature}`);
  }

  // 3. Check balance
  console.log('\nAgent: "Checking your balance"');
  const balance = await tool.getBalance({ publicKey: wallet.publicKey });
  console.log(`Tool Result: Balance is ${balance.sol} SOL`);

  // 4. Send payment (example)
  console.log('\nAgent: "Sending 0.1 SOL to the recipient"');
  const recipient = 'ExampleRecipientPublicKey11111111111111111';
  const sendResult = await tool.sendPayment({
    to: recipient,
    amount: 0.1,
    token: 'SOL',
    memo: 'LangChain agent payment',
  });

  if (sendResult.success) {
    console.log(`Tool Result: Payment sent! Signature: ${sendResult.signature}`);
  } else {
    console.log(`Tool Result: Payment failed - ${sendResult.error}`);
    console.log('(Expected - example recipient is invalid)');
  }

  // 5. Get history
  console.log('\nAgent: "Let me check your transaction history"');
  const history = await tool.getTransactionHistory({
    publicKey: wallet.publicKey,
    limit: 5,
  });
  console.log(`Tool Result: Found ${history.transactions.length} transactions`);

  // Example: How to integrate with LangChain
  console.log('\n--- LangChain Integration Example ---\n');
  console.log(`
// In your LangChain agent setup:

import { createMoltPayTool, MOLTPAY_TOOL_SCHEMAS } from 'moltpay';
import { DynamicStructuredTool } from 'langchain/tools';
import { z } from 'zod';

const moltpay = createMoltPayTool({
  encryptionKey: process.env.MOLTPAY_KEY,
});

const sendPaymentTool = new DynamicStructuredTool({
  name: 'send_payment',
  description: 'Send SOL or tokens on Solana',
  schema: z.object({
    to: z.string().describe('Recipient public key'),
    amount: z.number().describe('Amount to send'),
    token: z.string().default('SOL'),
  }),
  func: async ({ to, amount, token }) => {
    const result = await moltpay.sendPayment({ to, amount, token });
    return JSON.stringify(result);
  },
});

// Add to your agent's tools array
const tools = [sendPaymentTool, ...otherTools];
`);

  console.log('✅ LangChain integration example complete');
}

main().catch(console.error);
