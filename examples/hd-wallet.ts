/**
 * HD Wallet Example
 *
 * Demonstrates how to:
 * 1. Create an HD wallet with mnemonic
 * 2. Derive multiple wallets from the same seed
 * 3. Import wallet from mnemonic
 */

import { MoltPay } from '../src';

async function main() {
  const encryptionKey = process.env.MOLTPAY_ENCRYPTION_KEY || 'my-secure-encryption-key';

  const moltpay = new MoltPay({
    encryptionKey,
    rpcEndpoint: 'https://api.devnet.solana.com',
  });

  console.log('🔐 MoltPay HD Wallet Example\n');

  // Create HD wallet
  console.log('Creating HD wallet...');
  const { wallet, mnemonic } = moltpay.wallet.createHDWallet();

  console.log('Generated mnemonic (SAVE THIS!):');
  console.log(`\n  ${mnemonic}\n`);
  console.log(`Public Key: ${wallet.publicKey}`);
  console.log(`Derivation Path: ${wallet.derivationPath}`);
  console.log(`Account Index: ${wallet.accountIndex}`);

  // Derive multiple wallets from same mnemonic
  console.log('\n--- Deriving Multiple Wallets ---\n');

  const derivedWallets = moltpay.wallet.deriveMultipleWallets(mnemonic, 5);

  derivedWallets.forEach((w, i) => {
    console.log(`Wallet ${i}: ${w.publicKey}`);
    console.log(`  Path: ${w.derivationPath}`);
  });

  // Import from mnemonic (recovery)
  console.log('\n--- Recovery Test ---\n');

  console.log('Importing wallet from mnemonic...');
  const recoveredWallet = moltpay.wallet.importFromMnemonic(mnemonic, 0);

  console.log(`Original:  ${wallet.publicKey}`);
  console.log(`Recovered: ${recoveredWallet.publicKey}`);

  if (wallet.publicKey === recoveredWallet.publicKey) {
    console.log('✅ Recovery successful! Keys match.');
  } else {
    console.log('❌ Recovery failed! Keys do not match.');
  }

  // Demonstrate encryption/decryption
  console.log('\n--- Encryption Test ---\n');

  const keypair = moltpay.wallet.decryptWallet(wallet);
  console.log('Wallet decrypted successfully');
  console.log(`Secret key length: ${keypair.secretKey.length} bytes`);

  // Best practices
  console.log('\n📝 Best Practices:');
  console.log('1. Store mnemonic securely (never in code or logs)');
  console.log('2. Use strong encryption key (min 32 chars)');
  console.log('3. Derive separate wallets for different purposes');
  console.log('4. Test recovery before storing significant funds');
}

main().catch(console.error);
