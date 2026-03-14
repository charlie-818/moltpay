#!/usr/bin/env node
/**
 * Test wallet persistence via MCP tools
 */
const { MoltPayMcpServer } = require('../dist/mcp/McpServer');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';

async function simulateToolCall(server, name, args = {}) {
  // Simulate MCP tool call
  const result = await server['executeTool'](name, args);
  return result;
}

async function run() {
  console.log('='.repeat(60));
  console.log('Wallet Persistence Test');
  console.log('='.repeat(60));
  console.log();

  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });

  // Check existing wallets
  console.log('1. Listing existing wallets...');
  const existing = await simulateToolCall(server, 'list_wallets');
  console.log(`   Found ${existing.count} wallets`);
  for (const w of existing.wallets) {
    console.log(`   - ${w.publicKey.substring(0, 20)}... (${new Date(w.createdAt).toISOString()})`);
  }
  console.log();

  // Create a new wallet
  console.log('2. Creating new wallet (will be persisted)...');
  const wallet = await simulateToolCall(server, 'create_wallet');
  console.log(`   Public Key: ${wallet.publicKey}`);
  console.log(`   Persisted: ${wallet.persisted}`);
  console.log(`   Total wallets: ${wallet.walletCount}`);
  console.log();

  // List wallets again
  console.log('3. Listing wallets after creation...');
  const afterCreate = await simulateToolCall(server, 'list_wallets');
  console.log(`   Found ${afterCreate.count} wallets`);
  for (const w of afterCreate.wallets) {
    console.log(`   - ${w.publicKey.substring(0, 20)}...`);
  }
  console.log();

  // Load the wallet (should already be active, but test the load function)
  console.log('4. Testing load_wallet...');
  if (afterCreate.wallets.length > 0) {
    const firstWallet = afterCreate.wallets[0].publicKey;
    const loaded = await simulateToolCall(server, 'load_wallet', { publicKey: firstWallet });
    console.log(`   Loaded: ${loaded.publicKey.substring(0, 20)}...`);
    console.log(`   Message: ${loaded.message}`);
  }
  console.log();

  // Try airdrop
  console.log('5. Requesting airdrop...');
  const airdrop = await simulateToolCall(server, 'request_airdrop', {
    publicKey: wallet.publicKey,
    amount: 1,
  });
  if (airdrop.success) {
    console.log(`   ✓ Airdrop: ${airdrop.signature}`);
  } else {
    console.log(`   ✗ ${airdrop.error.substring(0, 50)}...`);
    console.log(`\n   Fund manually: ${wallet.publicKey}`);
    console.log(`   Then run: node scripts/test-persist.js`);
  }
  console.log();

  // Check balance
  console.log('6. Checking balance...');
  const balance = await simulateToolCall(server, 'get_balance', { publicKey: wallet.publicKey });
  console.log(`   Balance: ${balance.sol} SOL`);

  if (balance.sol > 0) {
    // Create recipient
    console.log('\n7. Creating recipient...');
    const recipient = await simulateToolCall(server, 'create_wallet');
    console.log(`   Recipient: ${recipient.publicKey}`);

    // Load sender (first wallet)
    console.log('\n8. Loading sender wallet...');
    await simulateToolCall(server, 'load_wallet', { publicKey: wallet.publicKey });

    // Send
    console.log('\n9. Sending 0.1 SOL...');
    const payment = await simulateToolCall(server, 'send_payment', {
      to: recipient.publicKey,
      amount: 0.1,
      memo: 'Persistence Test',
    });

    if (payment.success) {
      console.log(`   ✓ TX: ${payment.signature}`);
      console.log(`   Receipt: ${payment.receiptId}`);
      console.log(`\n   Solscan: https://solscan.io/tx/${payment.signature}?cluster=devnet`);
    } else {
      console.log(`   ✗ ${payment.error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Wallet file: ~/.moltpay/wallets.json');
  console.log('='.repeat(60));
}

run().catch(console.error);
