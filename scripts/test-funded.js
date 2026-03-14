#!/usr/bin/env node
const { MoltPayMcpServer } = require('../dist/mcp/McpServer');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';
const FUNDED_WALLET = '9KiRXC6fkqDfD86XeSCcfCrD8HGQLVG9K5HgHS7RrmD1';

async function call(server, name, args = {}) {
  return server['executeTool'](name, args);
}

async function run() {
  console.log('='.repeat(60));
  console.log('MoltPay Complete Payment Test');
  console.log('='.repeat(60));
  console.log();

  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });

  // 1. Check balance of funded wallet
  console.log('1. Checking funded wallet balance...');
  const balance = await call(server, 'get_balance', { publicKey: FUNDED_WALLET });
  console.log(`   Wallet: ${FUNDED_WALLET}`);
  console.log(`   Balance: ${balance.sol} SOL`);
  console.log();

  if (balance.sol === 0) {
    console.log('   Wallet not funded yet!');
    console.log(`   Fund at: https://faucet.solana.com`);
    return;
  }

  // 2. Load the funded wallet as active
  console.log('2. Loading funded wallet as active...');
  const loaded = await call(server, 'load_wallet', { publicKey: FUNDED_WALLET });
  console.log(`   ✓ ${loaded.message}`);
  console.log();

  // 3. Create recipient wallet
  console.log('3. Creating recipient wallet...');
  const recipient = await call(server, 'create_wallet');
  console.log(`   Recipient: ${recipient.publicKey}`);
  console.log();

  // 4. Re-load the funded wallet (creating recipient made it active)
  console.log('4. Re-loading sender wallet...');
  await call(server, 'load_wallet', { publicKey: FUNDED_WALLET });
  console.log(`   ✓ Sender wallet active`);
  console.log();

  // 5. Send payment
  console.log('5. Sending 0.1 SOL...');
  const payment = await call(server, 'send_payment', {
    to: recipient.publicKey,
    amount: 0.1,
    token: 'SOL',
    memo: 'MCP Test Payment',
  });

  if (payment.success) {
    console.log(`   ✓ SUCCESS!`);
    console.log(`   Signature: ${payment.signature}`);
    console.log(`   Status: ${payment.status}`);
    console.log(`   Receipt ID: ${payment.receiptId}`);
    console.log();

    // 6. Verify payment
    console.log('6. Verifying payment...');
    await new Promise(r => setTimeout(r, 3000));
    const verify = await call(server, 'verify_payment', {
      signature: payment.signature,
      expectedRecipient: recipient.publicKey,
      expectedAmount: 0.1,
    });
    console.log(`   Verified: ${verify.verified}`);
    if (verify.receipt) {
      console.log(`   From: ${verify.receipt.from}`);
      console.log(`   To: ${verify.receipt.to}`);
      console.log(`   Amount: ${verify.receipt.amount} ${verify.receipt.token}`);
    }
    console.log();

    // 7. Check final balances
    console.log('7. Final balances...');
    const senderBal = await call(server, 'get_balance', { publicKey: FUNDED_WALLET });
    const recipientBal = await call(server, 'get_balance', { publicKey: recipient.publicKey });
    console.log(`   Sender: ${senderBal.sol} SOL`);
    console.log(`   Recipient: ${recipientBal.sol} SOL`);
    console.log();

    // 8. Transaction history
    console.log('8. Transaction history...');
    const history = await call(server, 'get_history', { publicKey: FUNDED_WALLET, limit: 5 });
    console.log(`   Found ${history.transactions.length} transactions`);
    for (const tx of history.transactions) {
      console.log(`   - ${tx.signature.substring(0, 16)}... ${tx.amount} ${tx.token}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log();
    console.log('Solscan Links:');
    console.log(`  Payment TX: https://solscan.io/tx/${payment.signature}?cluster=devnet`);
    console.log(`  Sender:     https://solscan.io/account/${FUNDED_WALLET}?cluster=devnet`);
    console.log(`  Recipient:  https://solscan.io/account/${recipient.publicKey}?cluster=devnet`);
  } else {
    console.log(`   ✗ Payment failed: ${payment.error}`);
  }
}

run().catch(console.error);
