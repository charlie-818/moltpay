#!/usr/bin/env node
/**
 * Test with alternative RPC endpoints
 */

const { Connection, LAMPORTS_PER_SOL, PublicKey } = require('@solana/web3.js');
const { MoltPayMcpServer } = require('../dist/mcp/McpServer');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';

// Alternative devnet RPC endpoints
const RPC_ENDPOINTS = [
  'https://api.devnet.solana.com',
  'https://devnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92',
  'https://rpc.ankr.com/solana_devnet',
];

async function tryAirdrop(connection, publicKey) {
  try {
    console.log(`   Trying airdrop via ${connection.rpcEndpoint.substring(0, 50)}...`);
    const signature = await connection.requestAirdrop(
      new PublicKey(publicKey),
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature, 'confirmed');
    return { success: true, signature };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MoltPay MCP - Alternative RPC Test');
  console.log('='.repeat(60));
  console.log();

  const server = new MoltPayMcpServer({
    encryptionKey: TEST_ENCRYPTION_KEY,
    network: 'devnet',
  });
  const moltpay = server.getMoltPayTool();

  // Create wallet
  console.log('Creating wallet...');
  const wallet = await moltpay.createWallet();
  console.log(`Wallet: ${wallet.publicKey}`);
  console.log();

  // Try each RPC endpoint for airdrop
  console.log('Attempting airdrop from multiple endpoints...');
  let airdropSuccess = false;
  let airdropSig = null;

  for (const endpoint of RPC_ENDPOINTS) {
    const connection = new Connection(endpoint, 'confirmed');
    const result = await tryAirdrop(connection, wallet.publicKey);

    if (result.success) {
      console.log(`   ✓ Success via ${endpoint.substring(0, 40)}...`);
      console.log(`   Signature: ${result.signature}`);
      airdropSuccess = true;
      airdropSig = result.signature;
      break;
    } else {
      console.log(`   ✗ Failed: ${result.error.substring(0, 50)}...`);
    }
  }
  console.log();

  if (!airdropSuccess) {
    console.log('All RPC endpoints rate-limited. Try web faucet:');
    console.log(`https://faucet.solana.com`);
    console.log(`Wallet: ${wallet.publicKey}`);
    return;
  }

  // Wait for confirmation
  console.log('Waiting for confirmation...');
  await new Promise(r => setTimeout(r, 3000));

  // Check balance
  console.log('Checking balance...');
  const balance = await moltpay.getBalance({ publicKey: wallet.publicKey });
  console.log(`Balance: ${balance.sol} SOL`);
  console.log();

  if (balance.sol > 0) {
    // Create recipient
    const recipient = await moltpay.createWallet();
    console.log(`Recipient: ${recipient.publicKey}`);

    // Send payment
    console.log('\nSending 0.1 SOL...');
    const payment = await moltpay.sendPayment({
      to: recipient.publicKey,
      amount: 0.1,
      memo: 'MCP Test',
    });

    if (payment.success) {
      console.log(`✓ Payment sent!`);
      console.log(`Signature: ${payment.signature}`);
      console.log(`TX: https://solscan.io/tx/${payment.signature}?cluster=devnet`);

      // Verify
      await new Promise(r => setTimeout(r, 2000));
      const verification = await moltpay.verifyPayment({
        signature: payment.signature,
      });
      console.log(`\nVerified: ${verification.verified}`);
      if (verification.receipt) {
        console.log(`Receipt: ${verification.receipt.receiptId}`);
      }
    } else {
      console.log(`✗ Payment failed: ${payment.error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('LINKS');
  console.log('='.repeat(60));
  console.log(`Wallet: https://solscan.io/account/${wallet.publicKey}?cluster=devnet`);
  if (airdropSig) {
    console.log(`Airdrop: https://solscan.io/tx/${airdropSig}?cluster=devnet`);
  }
}

runTests().catch(console.error);
