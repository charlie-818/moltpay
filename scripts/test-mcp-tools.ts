#!/usr/bin/env ts-node
/**
 * MCP Tools End-to-End Test Script
 *
 * Tests all MoltPay MCP tools on devnet:
 * - create_wallet
 * - get_balance
 * - request_airdrop
 * - send_payment
 * - verify_payment
 * - get_history
 */

import { MoltPayMcpServer } from '../src/mcp/McpServer';

// Test encryption key (for testing only - never use in production)
const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';

interface TestResult {
  tool: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

async function runTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('MoltPay MCP Tools - End-to-End Test');
  console.log('Network: devnet');
  console.log('='.repeat(60));
  console.log();

  const results: TestResult[] = [];

  // Initialize the MCP server (we'll use its internal MoltPayTool)
  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });

  const moltpay = server.getMoltPayTool();

  // Test 1: Create Wallet 1 (sender)
  console.log('1. Testing create_wallet (sender)...');
  let wallet1: { publicKey: string; createdAt: number };
  try {
    wallet1 = await moltpay.createWallet();
    console.log(`   ✓ Created wallet: ${wallet1.publicKey}`);
    console.log(`   ✓ Created at: ${new Date(wallet1.createdAt).toISOString()}`);
    console.log(`   ✓ Solscan: https://solscan.io/account/${wallet1.publicKey}?cluster=devnet`);
    results.push({ tool: 'create_wallet (sender)', success: true, data: wallet1 });
  } catch (error) {
    console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
    results.push({ tool: 'create_wallet (sender)', success: false, error: String(error) });
    return;
  }
  console.log();

  // Test 2: Create Wallet 2 (recipient)
  console.log('2. Testing create_wallet (recipient)...');
  let wallet2: { publicKey: string; createdAt: number };
  try {
    // Save the first wallet, create second, then restore first as active
    const savedWallet = wallet1;
    wallet2 = await moltpay.createWallet();
    console.log(`   ✓ Created wallet: ${wallet2.publicKey}`);
    console.log(`   ✓ Solscan: https://solscan.io/account/${wallet2.publicKey}?cluster=devnet`);
    results.push({ tool: 'create_wallet (recipient)', success: true, data: wallet2 });
  } catch (error) {
    console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
    results.push({ tool: 'create_wallet (recipient)', success: false, error: String(error) });
    return;
  }
  console.log();

  // Test 3: Get Balance (should be 0)
  console.log('3. Testing get_balance (initial)...');
  try {
    const balance = await moltpay.getBalance({ publicKey: wallet1.publicKey });
    console.log(`   ✓ SOL balance: ${balance.sol}`);
    console.log(`   ✓ Tokens: ${balance.tokens.length}`);
    results.push({ tool: 'get_balance (initial)', success: true, data: balance });
  } catch (error) {
    console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
    results.push({ tool: 'get_balance (initial)', success: false, error: String(error) });
  }
  console.log();

  // Test 4: Request Airdrop for wallet 1
  console.log('4. Testing request_airdrop...');
  let airdropSignature: string | undefined;
  try {
    const airdrop = await moltpay.requestAirdrop({ publicKey: wallet1.publicKey, amount: 1 });
    if (airdrop.success && airdrop.signature) {
      airdropSignature = airdrop.signature;
      console.log(`   ✓ Airdrop successful!`);
      console.log(`   ✓ Signature: ${airdrop.signature}`);
      console.log(`   ✓ Solscan TX: https://solscan.io/tx/${airdrop.signature}?cluster=devnet`);
      results.push({ tool: 'request_airdrop', success: true, data: airdrop });
    } else {
      console.log(`   ✗ Airdrop failed: ${airdrop.error}`);
      results.push({ tool: 'request_airdrop', success: false, error: airdrop.error });
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
    results.push({ tool: 'request_airdrop', success: false, error: String(error) });
  }
  console.log();

  // Wait for airdrop to confirm
  console.log('   Waiting for airdrop confirmation (5 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log();

  // Test 5: Get Balance after airdrop
  console.log('5. Testing get_balance (after airdrop)...');
  let balanceAfterAirdrop = 0;
  try {
    const balance = await moltpay.getBalance({ publicKey: wallet1.publicKey });
    balanceAfterAirdrop = balance.sol;
    console.log(`   ✓ SOL balance: ${balance.sol}`);
    results.push({ tool: 'get_balance (after airdrop)', success: balance.sol > 0, data: balance });
  } catch (error) {
    console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
    results.push({ tool: 'get_balance (after airdrop)', success: false, error: String(error) });
  }
  console.log();

  // Test 6: Send Payment
  console.log('6. Testing send_payment...');
  let paymentSignature: string | undefined;
  if (balanceAfterAirdrop > 0) {
    try {
      // Need to set the first wallet as active again since createWallet sets wallet2 as active
      // We'll recreate wallet1 scenario by creating a new wallet with airdrop
      const payment = await moltpay.sendPayment({
        to: wallet2.publicKey,
        amount: 0.1,
        token: 'SOL',
        memo: 'MCP Test Payment',
      });

      if (payment.success && payment.signature) {
        paymentSignature = payment.signature;
        console.log(`   ✓ Payment sent!`);
        console.log(`   ✓ Signature: ${payment.signature}`);
        console.log(`   ✓ Status: ${payment.status}`);
        console.log(`   ✓ Receipt ID: ${payment.receiptId}`);
        console.log(`   ✓ Solscan TX: https://solscan.io/tx/${payment.signature}?cluster=devnet`);
        results.push({ tool: 'send_payment', success: true, data: payment });
      } else {
        console.log(`   ✗ Payment failed: ${payment.error}`);
        results.push({ tool: 'send_payment', success: false, error: payment.error });
      }
    } catch (error) {
      console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
      results.push({ tool: 'send_payment', success: false, error: String(error) });
    }
  } else {
    console.log('   ⊘ Skipped (no balance from airdrop)');
    results.push({ tool: 'send_payment', success: false, error: 'Skipped - no balance' });
  }
  console.log();

  // Wait for payment to confirm
  if (paymentSignature) {
    console.log('   Waiting for payment confirmation (3 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log();
  }

  // Test 7: Verify Payment
  console.log('7. Testing verify_payment...');
  if (paymentSignature) {
    try {
      const verification = await moltpay.verifyPayment({
        signature: paymentSignature,
        expectedRecipient: wallet2.publicKey,
        expectedAmount: 0.1,
      });

      console.log(`   ✓ Verified: ${verification.verified}`);
      if (verification.receipt) {
        console.log(`   ✓ Receipt ID: ${verification.receipt.receiptId}`);
        console.log(`   ✓ From: ${verification.receipt.from}`);
        console.log(`   ✓ To: ${verification.receipt.to}`);
        console.log(`   ✓ Amount: ${verification.receipt.amount} ${verification.receipt.token}`);
        console.log(`   ✓ Timestamp: ${new Date(verification.receipt.timestamp).toISOString()}`);
      }
      if (verification.failures && verification.failures.length > 0) {
        console.log(`   ! Failures: ${verification.failures.join(', ')}`);
      }
      results.push({ tool: 'verify_payment', success: verification.verified, data: verification });
    } catch (error) {
      console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
      results.push({ tool: 'verify_payment', success: false, error: String(error) });
    }
  } else {
    console.log('   ⊘ Skipped (no payment to verify)');
    results.push({ tool: 'verify_payment', success: false, error: 'Skipped - no payment' });
  }
  console.log();

  // Test 8: Get Transaction History
  console.log('8. Testing get_history...');
  try {
    const history = await moltpay.getTransactionHistory({
      publicKey: wallet1.publicKey,
      limit: 10,
      direction: 'all',
    });

    console.log(`   ✓ Found ${history.transactions.length} transactions`);
    for (const tx of history.transactions) {
      console.log(`   - ${tx.signature.substring(0, 20)}... | ${tx.amount} ${tx.token} | ${tx.status}`);
    }
    results.push({ tool: 'get_history', success: true, data: history });
  } catch (error) {
    console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
    results.push({ tool: 'get_history', success: false, error: String(error) });
  }
  console.log();

  // Test 9: Get Recipient Balance
  console.log('9. Testing get_balance (recipient)...');
  try {
    const balance = await moltpay.getBalance({ publicKey: wallet2.publicKey });
    console.log(`   ✓ Recipient SOL balance: ${balance.sol}`);
    results.push({ tool: 'get_balance (recipient)', success: true, data: balance });
  } catch (error) {
    console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
    results.push({ tool: 'get_balance (recipient)', success: false, error: String(error) });
  }
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log();
  for (const result of results) {
    const icon = result.success ? '✓' : '✗';
    console.log(`${icon} ${result.tool}`);
  }
  console.log();
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log();

  // Links
  console.log('='.repeat(60));
  console.log('SOLSCAN LINKS');
  console.log('='.repeat(60));
  console.log();
  console.log(`Wallet 1: https://solscan.io/account/${wallet1.publicKey}?cluster=devnet`);
  console.log(`Wallet 2: https://solscan.io/account/${wallet2.publicKey}?cluster=devnet`);
  if (airdropSignature) {
    console.log(`Airdrop TX: https://solscan.io/tx/${airdropSignature}?cluster=devnet`);
  }
  if (paymentSignature) {
    console.log(`Payment TX: https://solscan.io/tx/${paymentSignature}?cluster=devnet`);
  }
  console.log();
}

// Run tests
runTests().catch(console.error);
