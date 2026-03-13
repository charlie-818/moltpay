/**
 * OpenClaw Agent Integration Example
 *
 * Demonstrates how to use MoltPay with an OpenClaw agent
 * for autonomous payment processing.
 */

import { createMoltPaySkill, MoltPaySkill } from '../src/adapters/openclaw';

async function main() {
  console.log('🤖 MoltPay OpenClaw Agent Example\n');

  // Create the MoltPay skill
  const skill = createMoltPaySkill({
    encryption_key: process.env.MOLTPAY_ENCRYPTION_KEY || 'my-secure-encryption-key',
    network: 'devnet',
  });

  // Simulate agent actions
  console.log('--- Agent creates a wallet ---\n');

  const createResult = await skill.execute({
    action: 'create_wallet',
    params: {},
  });

  if (createResult.success) {
    const walletData = createResult.data as { publicKey: string };
    console.log(`Created wallet: ${walletData.publicKey}`);
  }

  // Request airdrop for testing
  console.log('\n--- Agent requests airdrop ---\n');

  const airdropResult = await skill.requestAirdrop({
    amount: 1,
  });

  if (airdropResult.success) {
    console.log('Airdrop successful');
  }

  // Check balance
  console.log('\n--- Agent checks balance ---\n');

  const balanceResult = await skill.execute({
    action: 'get_balance',
    params: {},
  });

  if (balanceResult.success) {
    const balanceData = balanceResult.data as { sol: number };
    console.log(`Balance: ${balanceData.sol} SOL`);
  }

  // Send payment (example - would need a real recipient)
  console.log('\n--- Agent sends payment ---\n');

  const recipientExample = 'ExampleRecipientPublicKey11111111111111111';

  const sendResult = await skill.execute({
    action: 'send',
    params: {
      to: recipientExample,
      amount: 0.1,
      token: 'SOL',
      memo: 'Payment from AI agent',
    },
  });

  if (sendResult.success) {
    const sendData = sendResult.data as { signature: string; receiptId: string };
    console.log(`Payment sent!`);
    console.log(`Signature: ${sendData.signature}`);
    console.log(`Receipt ID: ${sendData.receiptId}`);
  } else {
    console.log(`Payment failed: ${sendResult.error}`);
    console.log('(This is expected - the recipient address is an example)');
  }

  // Get transaction history
  console.log('\n--- Agent gets transaction history ---\n');

  const historyResult = await skill.execute({
    action: 'get_history',
    params: {
      limit: 5,
    },
  });

  if (historyResult.success) {
    const historyData = historyResult.data as {
      transactions: Array<{
        signature: string;
        amount: number;
        token: string;
      }>;
    };
    console.log(`Found ${historyData.transactions.length} transactions`);
    historyData.transactions.forEach((tx, i) => {
      console.log(`  ${i + 1}. ${tx.amount} ${tx.token} - ${tx.signature.slice(0, 20)}...`);
    });
  }

  console.log('\n✅ OpenClaw integration example complete');
  console.log('\nTo integrate with a real OpenClaw agent:');
  console.log('1. Place the skill files in your skills directory');
  console.log('2. Register in openclaw.plugin.json');
  console.log('3. Configure MOLTPAY_ENCRYPTION_KEY in settings');
}

main().catch(console.error);
