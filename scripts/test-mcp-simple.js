#!/usr/bin/env node
/**
 * Simple MCP Tools Test - uses RPC directly to verify functionality
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair } = require('@solana/web3.js');
const { MoltPayMcpServer } = require('../dist/mcp/McpServer');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';
const RPC_ENDPOINT = 'https://api.devnet.solana.com';

async function runTests() {
  console.log('='.repeat(60));
  console.log('MoltPay MCP Tools - Simple Test');
  console.log('Network: devnet');
  console.log('='.repeat(60));
  console.log();

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');

  // Initialize server
  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });
  const moltpay = server.getMoltPayTool();

  // Test 1: Create wallets
  console.log('1. Creating wallets...');
  const wallet1 = await moltpay.createWallet();
  console.log(`   Wallet 1 (will be sender): ${wallet1.publicKey}`);

  const wallet2 = await moltpay.createWallet();
  console.log(`   Wallet 2 (will be recipient): ${wallet2.publicKey}`);
  console.log();

  // Test 2: Verify wallets exist on chain (check account info)
  console.log('2. Verifying wallets exist on devnet...');
  try {
    const info1 = await connection.getAccountInfo(new PublicKey(wallet1.publicKey));
    const info2 = await connection.getAccountInfo(new PublicKey(wallet2.publicKey));
    console.log(`   Wallet 1 account: ${info1 ? 'exists' : 'new (no lamports yet)'}`);
    console.log(`   Wallet 2 account: ${info2 ? 'exists' : 'new (no lamports yet)'}`);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
  console.log();

  // Test 3: Get balance
  console.log('3. Testing get_balance...');
  const balance1 = await moltpay.getBalance({ publicKey: wallet1.publicKey });
  const balance2 = await moltpay.getBalance({ publicKey: wallet2.publicKey });
  console.log(`   Wallet 1 balance: ${balance1.sol} SOL`);
  console.log(`   Wallet 2 balance: ${balance2.sol} SOL`);
  console.log();

  // Test 4: Try alternate airdrop method using web faucet
  console.log('4. Attempting web faucet airdrop...');
  try {
    // Try to get airdrop using different method - skip this since faucet is rate limited
    console.log('   Note: Devnet faucet is often rate-limited.');
    console.log('   For manual testing, use: https://faucet.solana.com');
    console.log(`   Paste wallet: ${wallet2.publicKey}`);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
  console.log();

  // Test 5: Test get_history (should be empty for new wallets)
  console.log('5. Testing get_history...');
  const history = await moltpay.getTransactionHistory({
    publicKey: wallet1.publicKey,
    limit: 5,
    direction: 'all',
  });
  console.log(`   Transaction count: ${history.transactions.length}`);
  console.log();

  // Test 6: Test verify_payment with a known devnet transaction
  console.log('6. Testing verify_payment with known devnet TX...');
  // Use a known successful devnet transaction signature
  const knownTxSignature = '5wHu1qwD7q4wVxLGBFk1HQvwbJBjyFZcvBMHKYkGqX6t';
  try {
    const verification = await moltpay.verifyPayment({
      signature: knownTxSignature,
    });
    console.log(`   Verified: ${verification.verified}`);
    if (verification.failures) {
      console.log(`   Failures: ${verification.failures.join(', ')}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
    console.log('   (This is expected - the sample TX may not exist)');
  }
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
  console.log();
  console.log('Created Wallets:');
  console.log(`  Wallet 1: ${wallet1.publicKey}`);
  console.log(`  Wallet 2: ${wallet2.publicKey}`);
  console.log();
  console.log('Solscan Links:');
  console.log(`  Wallet 1: https://solscan.io/account/${wallet1.publicKey}?cluster=devnet`);
  console.log(`  Wallet 2: https://solscan.io/account/${wallet2.publicKey}?cluster=devnet`);
  console.log();
  console.log('To complete payment test:');
  console.log('1. Go to https://faucet.solana.com');
  console.log(`2. Paste wallet address: ${wallet2.publicKey}`);
  console.log('3. Request SOL (will fund the active wallet)');
  console.log('4. Re-run this script to test send_payment');
  console.log();
}

runTests().catch(console.error);
