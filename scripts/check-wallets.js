#!/usr/bin/env node
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// All wallets created during testing
const wallets = [
  '8RgEKhhBq3GdYnR8JxttvwQdx1q8m8F7FEXKnhLqBkuH',
  'gKwe1zFjrKc1a6K2u2C9ufVaavxJkwm3TsGMh7vF7HV',
  '7z69KLypi1s6A2JtaqwG65CKjcjjqUFreWZPzTcDWHXX',
  '4B48E8AMWjpXEZ3mnusrhVZLejnfrCTyuCs1sJ55EtqC',
  '5G5JSbg7Cwid2rnzkAyQVLEy3dJTvQWMPT6GRUk41hWr',
  '7dDjM4gFxD1iKQzoYgsLfGXtQdxwf9Kd98hyBnaYtL4f',
  'EttnKGcprGeeo8JKzcyLn24LeXKi3P6nFTh6RSr6kzXk',
  '4W5J3SwwBwUeC6joQaoaxjjPjz6HERzyuHKMCHKK1nGT',
  '3FPC4AfUDM2Z6pZqquq9y8ibC2tKFbpQwfHGyDatyJst',
  'AUdpw4wLmW63sum9fz2eBbpRuJQYdoH2tWD3f1MZPjK7',
];

async function checkBalances() {
  console.log('Checking all test wallet balances...\n');

  for (const wallet of wallets) {
    try {
      const balance = await connection.getBalance(new PublicKey(wallet));
      const sol = balance / LAMPORTS_PER_SOL;
      if (sol > 0) {
        console.log(`✓ ${wallet}: ${sol} SOL`);
      } else {
        console.log(`  ${wallet}: 0 SOL`);
      }
    } catch (e) {
      console.log(`✗ ${wallet}: Error`);
    }
  }
}

checkBalances().catch(console.error);
