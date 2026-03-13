import { createAgentAPI } from '../src';

async function main() {
  // Initialize API (defaults to devnet)
  const api = createAgentAPI({ cluster: 'devnet' });

  // Create wallets for two agents
  const agent1 = api.createWallet('agent-1');
  const agent2 = api.createWallet('agent-2');

  console.log('Agent 1 address:', agent1.address);
  console.log('Agent 2 address:', agent2.address);

  // Request airdrop for agent 1 (devnet only)
  console.log('Requesting airdrop...');
  await api.requestAirdrop('agent-1', 1);

  // Check balances
  const balance1 = await api.getBalance('agent-1');
  console.log('Agent 1 balance:', balance1.balance, 'SOL');

  // Send SOL from agent 1 to agent 2
  console.log('Sending 0.1 SOL from agent-1 to agent-2...');
  const result = await api.sendBetweenAgents('agent-1', 'agent-2', 0.1);

  if (result.success) {
    console.log('Transaction successful:', result.signature);
  } else {
    console.error('Transaction failed:', result.error);
  }

  // Check final balances
  const finalBalance1 = await api.getBalance('agent-1');
  const finalBalance2 = await api.getBalance('agent-2');

  console.log('Final balances:');
  console.log('  Agent 1:', finalBalance1.balance, 'SOL');
  console.log('  Agent 2:', finalBalance2.balance, 'SOL');
}

main().catch(console.error);
