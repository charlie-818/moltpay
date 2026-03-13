/**
 * Payment Verification Example
 *
 * Demonstrates how to:
 * 1. Verify a payment on-chain
 * 2. Validate expected recipient and amount
 * 3. Generate proof of payment
 */

import { MoltPay } from '../src';

async function main() {
  const encryptionKey = process.env.MOLTPAY_ENCRYPTION_KEY || 'my-secure-encryption-key';

  const moltpay = new MoltPay({
    encryptionKey,
    rpcEndpoint: 'https://api.devnet.solana.com',
  });

  console.log('🔍 MoltPay Payment Verification Example\n');

  // Example: Verify a transaction signature
  // In a real app, you'd get this from a customer or webhook
  const signatureToVerify = process.argv[2] || 'example-signature';

  console.log(`Verifying transaction: ${signatureToVerify}\n`);

  // Verify without expectations (just check if valid)
  const basicReceipt = await moltpay.verifier.verifyPayment({
    signature: signatureToVerify,
  });

  if (basicReceipt.verified) {
    console.log('✅ Transaction verified!');
    console.log(`From: ${basicReceipt.from}`);
    console.log(`To: ${basicReceipt.to}`);
    console.log(`Amount: ${basicReceipt.amount} ${basicReceipt.token}`);
    console.log(`Timestamp: ${new Date(basicReceipt.timestamp * 1000).toISOString()}`);
  } else {
    console.log('❌ Transaction verification failed');
    console.log('Failures:', basicReceipt.failures);
    return;
  }

  // Verify with expectations (for merchant use case)
  console.log('\n--- Verifying with expectations ---\n');

  const merchantAddress = process.env.MERCHANT_ADDRESS || basicReceipt.to;
  const expectedAmount = 1.5;

  const strictReceipt = await moltpay.verifier.verifyPayment({
    signature: signatureToVerify,
    expectedRecipient: merchantAddress,
    expectedAmount: expectedAmount,
    expectedToken: 'SOL',
    tolerance: 0.01, // 1% tolerance
  });

  if (strictReceipt.verified) {
    console.log('✅ Payment matches expectations!');

    // Generate proof of payment
    const proof = moltpay.receipts.createProofOfPayment(strictReceipt);
    console.log('\n📜 Proof of Payment:');
    console.log(JSON.stringify(proof, null, 2));
  } else {
    console.log('❌ Payment does not match expectations');
    strictReceipt.failures?.forEach((failure) => {
      console.log(`  - ${failure}`);
    });
  }

  // Formatted receipt
  console.log('\n--- Formatted Receipt ---');
  console.log(moltpay.receipts.formatReceipt(basicReceipt));
}

main().catch(console.error);
