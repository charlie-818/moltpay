#!/usr/bin/env node
/**
 * Full MCP Tools Test with Retry Logic
 *
 * Tests all MoltPay MCP tools with better error handling and retry logic.
 */

const { Connection, LAMPORTS_PER_SOL, PublicKey } = require('@solana/web3.js');
const { MoltPayMcpServer } = require('../dist/mcp/McpServer');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestAirdropWithRetry(connection, publicKey, amount, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   Attempt ${attempt}/${maxRetries}...`);
      const signature = await connection.requestAirdrop(
        new PublicKey(publicKey),
        amount * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature, 'confirmed');
      return { success: true, signature };
    } catch (error) {
      if (attempt === maxRetries) {
        return { success: false, error: error.message };
      }
      console.log(`   Retrying in ${attempt * 2} seconds...`);
      await sleep(attempt * 2000);
    }
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MoltPay MCP Tools - Full Test Suite');
  console.log('Network: devnet');
  console.log('Time: ' + new Date().toISOString());
  console.log('='.repeat(60));
  console.log();

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });
  const moltpay = server.getMoltPayTool();

  const results = [];

  // Test 1: Create sender wallet
  console.log('TEST 1: create_wallet (sender)');
  console.log('-'.repeat(40));
  let senderWallet;
  try {
    senderWallet = await moltpay.createWallet();
    console.log(`   ✓ Public Key: ${senderWallet.publicKey}`);
    console.log(`   ✓ Created: ${new Date(senderWallet.createdAt).toISOString()}`);
    results.push({ test: 'create_wallet (sender)', passed: true });
  } catch (error) {
    console.log(`   ✗ Error: ${error.message}`);
    results.push({ test: 'create_wallet (sender)', passed: false, error: error.message });
    return printSummary(results);
  }
  console.log();

  // Test 2: Create recipient wallet
  console.log('TEST 2: create_wallet (recipient)');
  console.log('-'.repeat(40));
  let recipientWallet;
  try {
    recipientWallet = await moltpay.createWallet();
    console.log(`   ✓ Public Key: ${recipientWallet.publicKey}`);
    results.push({ test: 'create_wallet (recipient)', passed: true });
  } catch (error) {
    console.log(`   ✗ Error: ${error.message}`);
    results.push({ test: 'create_wallet (recipient)', passed: false, error: error.message });
    return printSummary(results);
  }
  console.log();

  // Test 3: Get initial balance
  console.log('TEST 3: get_balance (initial)');
  console.log('-'.repeat(40));
  try {
    const balance = await moltpay.getBalance({ publicKey: recipientWallet.publicKey });
    console.log(`   ✓ SOL: ${balance.sol}`);
    console.log(`   ✓ Tokens: ${balance.tokens.length}`);
    results.push({ test: 'get_balance (initial)', passed: true });
  } catch (error) {
    console.log(`   ✗ Error: ${error.message}`);
    results.push({ test: 'get_balance (initial)', passed: false, error: error.message });
  }
  console.log();

  // Test 4: Request airdrop (direct connection, not through MoltPay - to bypass rate limits)
  console.log('TEST 4: request_airdrop (via connection)');
  console.log('-'.repeat(40));
  const airdropResult = await requestAirdropWithRetry(connection, recipientWallet.publicKey, 1);
  if (airdropResult.success) {
    console.log(`   ✓ Airdrop successful!`);
    console.log(`   ✓ Signature: ${airdropResult.signature}`);
    console.log(`   ✓ TX: https://solscan.io/tx/${airdropResult.signature}?cluster=devnet`);
    results.push({ test: 'request_airdrop', passed: true, signature: airdropResult.signature });
  } else {
    console.log(`   ✗ Airdrop failed: ${airdropResult.error}`);
    console.log(`   Note: Devnet faucet may be rate-limited`);
    console.log(`   Manual: https://faucet.solana.com`);
    console.log(`   Wallet: ${recipientWallet.publicKey}`);
    results.push({ test: 'request_airdrop', passed: false, error: airdropResult.error });
  }
  console.log();

  // Wait for confirmation
  await sleep(2000);

  // Test 5: Get balance after airdrop
  console.log('TEST 5: get_balance (after airdrop)');
  console.log('-'.repeat(40));
  let hasBalance = false;
  try {
    const balance = await moltpay.getBalance({ publicKey: recipientWallet.publicKey });
    console.log(`   ✓ SOL: ${balance.sol}`);
    hasBalance = balance.sol > 0;
    results.push({ test: 'get_balance (after airdrop)', passed: hasBalance });
  } catch (error) {
    console.log(`   ✗ Error: ${error.message}`);
    results.push({ test: 'get_balance (after airdrop)', passed: false, error: error.message });
  }
  console.log();

  // Test 6: Send payment (if we have balance)
  console.log('TEST 6: send_payment');
  console.log('-'.repeat(40));
  let paymentSignature = null;
  if (hasBalance) {
    try {
      const payment = await moltpay.sendPayment({
        to: senderWallet.publicKey, // Send back to first wallet
        amount: 0.1,
        token: 'SOL',
        memo: 'MCP Test Payment',
      });
      if (payment.success) {
        paymentSignature = payment.signature;
        console.log(`   ✓ Payment sent!`);
        console.log(`   ✓ Signature: ${payment.signature}`);
        console.log(`   ✓ Status: ${payment.status}`);
        console.log(`   ✓ Receipt: ${payment.receiptId}`);
        console.log(`   ✓ TX: https://solscan.io/tx/${payment.signature}?cluster=devnet`);
        results.push({ test: 'send_payment', passed: true, signature: payment.signature });
      } else {
        console.log(`   ✗ Payment failed: ${payment.error}`);
        results.push({ test: 'send_payment', passed: false, error: payment.error });
      }
    } catch (error) {
      console.log(`   ✗ Error: ${error.message}`);
      results.push({ test: 'send_payment', passed: false, error: error.message });
    }
  } else {
    console.log(`   ⊘ Skipped (no balance for payment)`);
    results.push({ test: 'send_payment', passed: false, error: 'Skipped - no balance' });
  }
  console.log();

  // Wait for payment confirmation
  if (paymentSignature) {
    await sleep(3000);
  }

  // Test 7: Verify payment
  console.log('TEST 7: verify_payment');
  console.log('-'.repeat(40));
  if (paymentSignature) {
    try {
      const verification = await moltpay.verifyPayment({
        signature: paymentSignature,
        expectedRecipient: senderWallet.publicKey,
        expectedAmount: 0.1,
      });
      console.log(`   ✓ Verified: ${verification.verified}`);
      if (verification.receipt) {
        console.log(`   ✓ From: ${verification.receipt.from}`);
        console.log(`   ✓ To: ${verification.receipt.to}`);
        console.log(`   ✓ Amount: ${verification.receipt.amount} ${verification.receipt.token}`);
        console.log(`   ✓ Receipt ID: ${verification.receipt.receiptId}`);
      }
      results.push({ test: 'verify_payment', passed: verification.verified });
    } catch (error) {
      console.log(`   ✗ Error: ${error.message}`);
      results.push({ test: 'verify_payment', passed: false, error: error.message });
    }
  } else {
    console.log(`   ⊘ Skipped (no payment to verify)`);
    results.push({ test: 'verify_payment', passed: false, error: 'Skipped - no payment' });
  }
  console.log();

  // Test 8: Get transaction history
  console.log('TEST 8: get_history');
  console.log('-'.repeat(40));
  try {
    const history = await moltpay.getTransactionHistory({
      publicKey: recipientWallet.publicKey,
      limit: 10,
      direction: 'all',
    });
    console.log(`   ✓ Found ${history.transactions.length} transactions`);
    for (const tx of history.transactions.slice(0, 3)) {
      console.log(`   - ${tx.signature.substring(0, 16)}... ${tx.amount} ${tx.token} [${tx.status}]`);
    }
    results.push({ test: 'get_history', passed: true, count: history.transactions.length });
  } catch (error) {
    console.log(`   ✗ Error: ${error.message}`);
    results.push({ test: 'get_history', passed: false, error: error.message });
  }
  console.log();

  // Test 9: Get recipient balance (should have received payment)
  console.log('TEST 9: get_balance (recipient after payment)');
  console.log('-'.repeat(40));
  try {
    const balance = await moltpay.getBalance({ publicKey: senderWallet.publicKey });
    console.log(`   ✓ SOL: ${balance.sol}`);
    results.push({ test: 'get_balance (final)', passed: true });
  } catch (error) {
    console.log(`   ✗ Error: ${error.message}`);
    results.push({ test: 'get_balance (final)', passed: false, error: error.message });
  }
  console.log();

  printSummary(results, senderWallet, recipientWallet, airdropResult.signature, paymentSignature);
}

function printSummary(results, senderWallet, recipientWallet, airdropSig, paymentSig) {
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const result of results) {
    const icon = result.passed ? '✓' : '✗';
    const extra = result.error ? ` (${result.error.substring(0, 30)}...)` : '';
    console.log(`  ${icon} ${result.test}${extra}`);
  }

  console.log();
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log();

  if (senderWallet || recipientWallet) {
    console.log('='.repeat(60));
    console.log('SOLSCAN LINKS');
    console.log('='.repeat(60));
    console.log();
    if (senderWallet) {
      console.log(`Sender:    https://solscan.io/account/${senderWallet.publicKey}?cluster=devnet`);
    }
    if (recipientWallet) {
      console.log(`Recipient: https://solscan.io/account/${recipientWallet.publicKey}?cluster=devnet`);
    }
    if (airdropSig) {
      console.log(`Airdrop:   https://solscan.io/tx/${airdropSig}?cluster=devnet`);
    }
    if (paymentSig) {
      console.log(`Payment:   https://solscan.io/tx/${paymentSig}?cluster=devnet`);
    }
    console.log();
  }
}

runTests().catch(console.error);
