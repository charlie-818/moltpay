/**
 * Basic SOL Transfer Example
 *
 * Demonstrates how to:
 * 1. Create a wallet
 * 2. Request devnet airdrop
 * 3. Send SOL to another wallet
 * 4. Check balances
 */

import { MoltPay, WalletManager } from '../src';

async function main() {
  // Initialize MoltPay with encryption key from environment
  const encryptionKey = process.env.MOLTPAY_ENCRYPTION_KEY || 'my-secure-encryption-key';

  const moltpay = new MoltPay({
    encryptionKey,
    rpcEndpoint: 'https://api.devnet.solana.com',
  });

  console.log('🚀 MoltPay Basic Transfer Example\n');

  // Create sender wallet
  console.log('Creating sender wallet...');
  const senderWallet = moltpay.wallet.createWallet();
  console.log(`Sender: ${senderWallet.publicKey}`);

  // Create recipient wallet
  console.log('Creating recipient wallet...');
  const recipientWallet = moltpay.wallet.createWallet();
  console.log(`Recipient: ${recipientWallet.publicKey}`);

  // Request airdrop for sender
  console.log('\nRequesting airdrop (2 SOL)...');
  const airdropSig = await moltpay.wallet.requestAirdrop(senderWallet.publicKey, 2);
  console.log(`Airdrop signature: ${airdropSig}`);

  // Check sender balance
  const senderBalance = await moltpay.wallet.getBalance(senderWallet.publicKey);
  console.log(`Sender balance: ${senderBalance.sol} SOL`);

  // Decrypt sender keypair for signing
  const senderKeypair = moltpay.wallet.decryptWallet(senderWallet);

  // Build transfer transaction
  console.log('\nBuilding transfer (1 SOL)...');
  const built = await moltpay.transactions.buildTransfer({
    sender: senderKeypair,
    recipient: new (await import('@solana/web3.js')).PublicKey(recipientWallet.publicKey),
    amount: 1,
    token: 'SOL',
    memo: 'MoltPay test transfer',
  });

  // Send and confirm
  console.log('Sending transaction...');
  const result = await moltpay.sender.signSendAndConfirm(built.transaction, [senderKeypair]);

  console.log(`\nTransaction ${result.status}!`);
  console.log(`Signature: ${result.signature}`);
  console.log(`Slot: ${result.slot}`);
  console.log(`Fee: ${result.fee} lamports`);

  // Generate receipt
  const receipt = moltpay.receipts.fromTransactionResult(
    result,
    senderWallet.publicKey,
    recipientWallet.publicKey,
    1,
    'SOL'
  );

  console.log('\n📄 Payment Receipt:');
  console.log(moltpay.receipts.formatReceipt(receipt));

  // Check final balances
  const finalSenderBalance = await moltpay.wallet.getBalance(senderWallet.publicKey);
  const recipientBalance = await moltpay.wallet.getBalance(recipientWallet.publicKey);

  console.log('\nFinal Balances:');
  console.log(`Sender: ${finalSenderBalance.sol} SOL`);
  console.log(`Recipient: ${recipientBalance.sol} SOL`);
}

main().catch(console.error);
