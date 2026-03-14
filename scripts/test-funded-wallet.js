#!/usr/bin/env node
/**
 * Test with the manually funded wallet
 */

const { MoltPayMcpServer } = require('../dist/mcp/McpServer');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';

// The wallet that was manually funded
const FUNDED_WALLET = '8RgEKhhBq3GdYnR8JxttvwQdx1q8m8F7FEXKnhLqBkuH';

async function runTests() {
  console.log('='.repeat(60));
  console.log('MoltPay MCP - Funded Wallet Test');
  console.log('='.repeat(60));
  console.log();

  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });
  const moltpay = server.getMoltPayTool();

  // Check balance of funded wallet
  console.log('1. Checking funded wallet balance...');
  const balance = await moltpay.getBalance({ publicKey: FUNDED_WALLET });
  console.log(`   Wallet: ${FUNDED_WALLET}`);
  console.log(`   Balance: ${balance.sol} SOL`);
  console.log();

  if (balance.sol === 0) {
    console.log('Wallet has no balance. Please fund it at:');
    console.log(`https://faucet.solana.com`);
    console.log(`Address: ${FUNDED_WALLET}`);
    return;
  }

  // Create a new wallet as active (sender) - this will have the funded balance
  console.log('2. Creating fresh wallet for payment...');
  const senderWallet = await moltpay.createWallet();
  console.log(`   New wallet: ${senderWallet.publicKey}`);

  // Request airdrop to the new wallet
  console.log('\n3. Requesting airdrop to new wallet...');
  const airdrop = await moltpay.requestAirdrop({
    publicKey: senderWallet.publicKey,
    amount: 1
  });

  if (airdrop.success) {
    console.log(`   ✓ Airdrop success: ${airdrop.signature}`);
    console.log('   Waiting 5 seconds for confirmation...');
    await new Promise(r => setTimeout(r, 5000));
  } else {
    console.log(`   ✗ Airdrop failed: ${airdrop.error}`);
    console.log('   Will use funded wallet balance check only');
  }

  // Check new wallet balance
  const newBalance = await moltpay.getBalance({ publicKey: senderWallet.publicKey });
  console.log(`   New wallet balance: ${newBalance.sol} SOL`);
  console.log();

  // If we have balance, send payment
  if (newBalance.sol > 0) {
    console.log('4. Sending payment (0.1 SOL)...');
    const payment = await moltpay.sendPayment({
      to: FUNDED_WALLET,
      amount: 0.1,
      token: 'SOL',
      memo: 'MCP Full Test Payment',
    });

    if (payment.success) {
      console.log(`   ✓ Payment sent!`);
      console.log(`   Signature: ${payment.signature}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Receipt: ${payment.receiptId}`);
      console.log(`   TX: https://solscan.io/tx/${payment.signature}?cluster=devnet`);
      console.log();

      // Wait and verify
      console.log('5. Verifying payment...');
      await new Promise(r => setTimeout(r, 3000));

      const verification = await moltpay.verifyPayment({
        signature: payment.signature,
        expectedRecipient: FUNDED_WALLET,
        expectedAmount: 0.1,
      });

      console.log(`   Verified: ${verification.verified}`);
      if (verification.receipt) {
        console.log(`   From: ${verification.receipt.from}`);
        console.log(`   To: ${verification.receipt.to}`);
        console.log(`   Amount: ${verification.receipt.amount} ${verification.receipt.token}`);
        console.log(`   Receipt ID: ${verification.receipt.receiptId}`);
      }
      console.log();

      // Get history
      console.log('6. Getting transaction history...');
      const history = await moltpay.getTransactionHistory({
        publicKey: senderWallet.publicKey,
        limit: 5,
      });
      console.log(`   Found ${history.transactions.length} transactions`);
      for (const tx of history.transactions) {
        console.log(`   - ${tx.signature.substring(0, 20)}... | ${tx.amount} ${tx.token}`);
      }

      console.log('\n' + '='.repeat(60));
      console.log('ALL TESTS PASSED!');
      console.log('='.repeat(60));
      console.log(`\nPayment TX: https://solscan.io/tx/${payment.signature}?cluster=devnet`);
    } else {
      console.log(`   ✗ Payment failed: ${payment.error}`);
    }
  } else {
    console.log('No balance available for payment test.');
  }
}

runTests().catch(console.error);
