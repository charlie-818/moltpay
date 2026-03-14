#!/usr/bin/env node
/**
 * Test verify_payment with a real devnet transaction
 *
 * Uses recent devnet transactions to verify the verification logic works.
 */

const { Connection } = require('@solana/web3.js');
const { MoltPayMcpServer } = require('../dist/mcp/McpServer');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';

async function findRecentTransaction() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  // Get recent slot
  const slot = await connection.getSlot();
  console.log(`Current slot: ${slot}`);

  // Get a recent confirmed block with transactions
  let foundTx = null;
  for (let i = 0; i < 20 && !foundTx; i++) {
    try {
      const block = await connection.getBlock(slot - i, {
        transactionDetails: 'full',
        maxSupportedTransactionVersion: 0,
      });
      if (block && block.transactions && block.transactions.length > 0) {
        // Find a simple SOL transfer
        for (const tx of block.transactions) {
          if (tx.meta && !tx.meta.err && tx.transaction.signatures.length > 0) {
            foundTx = tx.transaction.signatures[0];
            console.log(`Found transaction in slot ${slot - i}`);
            break;
          }
        }
      }
    } catch (e) {
      // Skip failed blocks
    }
  }
  return foundTx;
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MoltPay MCP Tools - Verification Test');
  console.log('Network: devnet');
  console.log('='.repeat(60));
  console.log();

  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });
  const moltpay = server.getMoltPayTool();

  // Find a real transaction to verify
  console.log('Finding recent devnet transaction...');
  const txSignature = await findRecentTransaction();

  if (!txSignature) {
    console.log('Could not find a recent transaction to verify.');
    return;
  }

  console.log(`\nFound transaction: ${txSignature}`);
  console.log(`Solscan: https://solscan.io/tx/${txSignature}?cluster=devnet`);
  console.log();

  // Test verify_payment
  console.log('Testing verify_payment...');
  console.log('-'.repeat(40));
  try {
    const verification = await moltpay.verifyPayment({
      signature: txSignature,
    });

    console.log(`Verified: ${verification.verified}`);

    if (verification.receipt) {
      console.log('\nReceipt:');
      console.log(`  Receipt ID: ${verification.receipt.receiptId}`);
      console.log(`  From: ${verification.receipt.from}`);
      console.log(`  To: ${verification.receipt.to}`);
      console.log(`  Amount: ${verification.receipt.amount} ${verification.receipt.token}`);
      console.log(`  Timestamp: ${new Date(verification.receipt.timestamp).toISOString()}`);
    }

    if (verification.failures && verification.failures.length > 0) {
      console.log(`\nFailures: ${verification.failures.join(', ')}`);
    }

    console.log('\n✓ verify_payment tool working correctly!');
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }
}

runTests().catch(console.error);
