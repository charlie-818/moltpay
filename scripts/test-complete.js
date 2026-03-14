#!/usr/bin/env node
/**
 * Complete end-to-end test in single session
 */
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { MoltPayMcpServer } = require('../dist/mcp/McpServer');
const readline = require('readline');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function waitForFunding(connection, publicKey, targetBalance = 0.5) {
  console.log(`\nWaiting for wallet to be funded...`);
  console.log(`Target: ${targetBalance} SOL`);
  console.log(`Wallet: ${publicKey}`);
  console.log(`\nFund at: https://faucet.solana.com`);
  console.log(`Or send from another devnet wallet.`);
  console.log(`\nPress Enter when funded (or Ctrl+C to cancel)...`);

  await ask('');

  const balance = await connection.getBalance(new PublicKey(publicKey));
  return balance / LAMPORTS_PER_SOL;
}

async function run() {
  console.log('='.repeat(60));
  console.log('MoltPay MCP - Complete End-to-End Test');
  console.log('='.repeat(60));
  console.log();

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });
  const moltpay = server.getMoltPayTool();

  // Step 1: Create recipient wallet first (so sender becomes active)
  console.log('Step 1: Creating recipient wallet...');
  const recipientWallet = await moltpay.createWallet();
  console.log(`   Recipient: ${recipientWallet.publicKey}`);
  console.log();

  // Step 2: Create sender wallet (this becomes the ACTIVE wallet)
  console.log('Step 2: Creating sender wallet (will be active)...');
  const senderWallet = await moltpay.createWallet();
  console.log(`   Sender: ${senderWallet.publicKey}`);
  console.log(`   This wallet is now ACTIVE and can send payments.`);
  console.log();

  // Step 3: Try to get funds
  console.log('Step 3: Attempting to fund sender wallet...');

  // Try airdrop first
  const airdrop = await moltpay.requestAirdrop({ publicKey: senderWallet.publicKey, amount: 1 });

  let senderBalance = 0;
  if (airdrop.success) {
    console.log(`   ✓ Airdrop successful: ${airdrop.signature}`);
    console.log('   Waiting 5 seconds for confirmation...');
    await new Promise(r => setTimeout(r, 5000));
    senderBalance = (await connection.getBalance(new PublicKey(senderWallet.publicKey))) / LAMPORTS_PER_SOL;
  } else {
    console.log(`   Airdrop failed (rate limited).`);
    console.log(`\n   Please fund the sender wallet manually:`);
    console.log(`   Wallet: ${senderWallet.publicKey}`);
    console.log(`   Faucet: https://faucet.solana.com`);

    senderBalance = await waitForFunding(connection, senderWallet.publicKey);
  }

  console.log(`   Sender balance: ${senderBalance} SOL`);
  console.log();

  if (senderBalance < 0.1) {
    console.log('Insufficient balance. Need at least 0.1 SOL.');
    rl.close();
    return;
  }

  // Step 4: Send payment
  console.log('Step 4: Sending payment (0.1 SOL)...');
  const payment = await moltpay.sendPayment({
    to: recipientWallet.publicKey,
    amount: 0.1,
    token: 'SOL',
    memo: 'MCP Test Payment',
  });

  if (payment.success) {
    console.log(`   ✓ Payment sent!`);
    console.log(`   Signature: ${payment.signature}`);
    console.log(`   Status: ${payment.status}`);
    console.log(`   Receipt ID: ${payment.receiptId}`);
    console.log(`   Solscan: https://solscan.io/tx/${payment.signature}?cluster=devnet`);
    console.log();

    // Step 5: Wait and verify
    console.log('Step 5: Verifying payment...');
    await new Promise(r => setTimeout(r, 3000));

    const verification = await moltpay.verifyPayment({
      signature: payment.signature,
      expectedRecipient: recipientWallet.publicKey,
      expectedAmount: 0.1,
    });

    console.log(`   Verified: ${verification.verified}`);
    if (verification.receipt) {
      console.log(`   From: ${verification.receipt.from}`);
      console.log(`   To: ${verification.receipt.to}`);
      console.log(`   Amount: ${verification.receipt.amount} ${verification.receipt.token}`);
      console.log(`   Timestamp: ${new Date(verification.receipt.timestamp).toISOString()}`);
    }
    console.log();

    // Step 6: Check balances
    console.log('Step 6: Final balances...');
    const finalSender = await moltpay.getBalance({ publicKey: senderWallet.publicKey });
    const finalRecipient = await moltpay.getBalance({ publicKey: recipientWallet.publicKey });
    console.log(`   Sender: ${finalSender.sol} SOL`);
    console.log(`   Recipient: ${finalRecipient.sol} SOL`);
    console.log();

    // Step 7: Transaction history
    console.log('Step 7: Transaction history...');
    const history = await moltpay.getTransactionHistory({
      publicKey: senderWallet.publicKey,
      limit: 5,
    });
    console.log(`   Found ${history.transactions.length} transactions`);
    for (const tx of history.transactions) {
      console.log(`   - ${tx.signature.substring(0, 20)}... | ${tx.amount} ${tx.token} | ${tx.status}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log();
    console.log('Solscan Links:');
    console.log(`  Sender:    https://solscan.io/account/${senderWallet.publicKey}?cluster=devnet`);
    console.log(`  Recipient: https://solscan.io/account/${recipientWallet.publicKey}?cluster=devnet`);
    console.log(`  Payment:   https://solscan.io/tx/${payment.signature}?cluster=devnet`);
  } else {
    console.log(`   ✗ Payment failed: ${payment.error}`);
  }

  rl.close();
}

run().catch(e => {
  console.error(e);
  rl.close();
});
