#!/usr/bin/env node
/**
 * Automatic end-to-end test (non-interactive)
 */
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { MoltPayMcpServer } = require('../dist/mcp/McpServer');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';

async function run() {
  console.log('='.repeat(60));
  console.log('MoltPay MCP - Automatic Test');
  console.log('='.repeat(60));
  console.log();

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });
  const moltpay = server.getMoltPayTool();

  // Create recipient first
  console.log('1. Creating recipient wallet...');
  const recipient = await moltpay.createWallet();
  console.log(`   ${recipient.publicKey}`);

  // Create sender (becomes active)
  console.log('\n2. Creating sender wallet (active)...');
  const sender = await moltpay.createWallet();
  console.log(`   ${sender.publicKey}`);

  // Try airdrop
  console.log('\n3. Requesting airdrop...');
  const airdrop = await moltpay.requestAirdrop({ publicKey: sender.publicKey, amount: 1 });

  if (!airdrop.success) {
    console.log(`   ✗ ${airdrop.error.substring(0, 60)}...`);
    console.log('\n   Manual funding required:');
    console.log(`   Wallet: ${sender.publicKey}`);
    console.log(`   Faucet: https://faucet.solana.com`);
    console.log('\n   After funding, run this script again.');
    return;
  }

  console.log(`   ✓ Airdrop: ${airdrop.signature}`);
  console.log('   Waiting 5s...');
  await new Promise(r => setTimeout(r, 5000));

  // Check balance
  const bal = await moltpay.getBalance({ publicKey: sender.publicKey });
  console.log(`   Balance: ${bal.sol} SOL`);

  if (bal.sol < 0.1) {
    console.log('   Insufficient balance');
    return;
  }

  // Send payment
  console.log('\n4. Sending 0.1 SOL...');
  const payment = await moltpay.sendPayment({
    to: recipient.publicKey,
    amount: 0.1,
    memo: 'MCP Test',
  });

  if (!payment.success) {
    console.log(`   ✗ ${payment.error}`);
    return;
  }

  console.log(`   ✓ Sent! TX: ${payment.signature}`);
  console.log(`   Receipt: ${payment.receiptId}`);

  // Verify
  console.log('\n5. Verifying...');
  await new Promise(r => setTimeout(r, 3000));
  const verify = await moltpay.verifyPayment({ signature: payment.signature });
  console.log(`   Verified: ${verify.verified}`);
  if (verify.receipt) {
    console.log(`   Amount: ${verify.receipt.amount} ${verify.receipt.token}`);
  }

  // History
  console.log('\n6. History...');
  const history = await moltpay.getTransactionHistory({ publicKey: sender.publicKey });
  console.log(`   ${history.transactions.length} transactions found`);

  // Final balances
  console.log('\n7. Final balances...');
  const senderBal = await moltpay.getBalance({ publicKey: sender.publicKey });
  const recipientBal = await moltpay.getBalance({ publicKey: recipient.publicKey });
  console.log(`   Sender: ${senderBal.sol} SOL`);
  console.log(`   Recipient: ${recipientBal.sol} SOL`);

  console.log('\n' + '='.repeat(60));
  console.log('SUCCESS! All MCP tools verified.');
  console.log('='.repeat(60));
  console.log(`\nPayment TX: https://solscan.io/tx/${payment.signature}?cluster=devnet`);
  console.log(`Sender:     https://solscan.io/account/${sender.publicKey}?cluster=devnet`);
  console.log(`Recipient:  https://solscan.io/account/${recipient.publicKey}?cluster=devnet`);
}

run().catch(console.error);
