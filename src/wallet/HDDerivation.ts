import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';

/** Default Solana derivation path (BIP44) */
export const DEFAULT_DERIVATION_PATH = "m/44'/501'/0'/0'";

/**
 * Generates a new BIP39 mnemonic phrase
 *
 * @param strength - Mnemonic strength (128 for 12 words, 256 for 24 words)
 * @returns Mnemonic phrase as space-separated words
 */
export function generateMnemonic(strength: 128 | 256 = 128): string {
  return bip39.generateMnemonic(strength);
}

/**
 * Validates a BIP39 mnemonic phrase
 *
 * @param mnemonic - Mnemonic phrase to validate
 * @returns Whether the mnemonic is valid
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Converts a mnemonic to a seed
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param passphrase - Optional passphrase for additional security
 * @returns 64-byte seed as Buffer
 */
export function mnemonicToSeed(mnemonic: string, passphrase: string = ''): Buffer {
  return bip39.mnemonicToSeedSync(mnemonic, passphrase);
}

/**
 * Derives a Solana keypair from a seed using the specified derivation path
 *
 * @param seed - 64-byte seed from mnemonic
 * @param path - BIP44 derivation path (default: m/44'/501'/0'/0')
 * @returns Solana Keypair
 */
export function deriveKeypair(seed: Buffer, path: string = DEFAULT_DERIVATION_PATH): Keypair {
  const derivedSeed = derivePath(path, seed.toString('hex')).key;
  return Keypair.fromSeed(derivedSeed);
}

/**
 * Generates the derivation path for a specific account index
 *
 * @param accountIndex - Account index (0-based)
 * @returns BIP44 derivation path
 */
export function getDerivationPath(accountIndex: number = 0): string {
  return `m/44'/501'/${accountIndex}'/0'`;
}

/**
 * Derives a keypair directly from a mnemonic
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param accountIndex - Account index for derivation (default: 0)
 * @param passphrase - Optional passphrase
 * @returns Solana Keypair
 */
export function keypairFromMnemonic(
  mnemonic: string,
  accountIndex: number = 0,
  passphrase: string = ''
): Keypair {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const seed = mnemonicToSeed(mnemonic, passphrase);
  const path = getDerivationPath(accountIndex);
  return deriveKeypair(seed, path);
}

/**
 * Derives multiple keypairs from a single mnemonic
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param count - Number of keypairs to derive
 * @param startIndex - Starting account index (default: 0)
 * @param passphrase - Optional passphrase
 * @returns Array of Solana Keypairs
 */
export function deriveMultipleKeypairs(
  mnemonic: string,
  count: number,
  startIndex: number = 0,
  passphrase: string = ''
): Keypair[] {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const seed = mnemonicToSeed(mnemonic, passphrase);
  const keypairs: Keypair[] = [];

  for (let i = 0; i < count; i++) {
    const path = getDerivationPath(startIndex + i);
    keypairs.push(deriveKeypair(seed, path));
  }

  return keypairs;
}

/**
 * Converts a mnemonic to entropy bytes
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @returns Entropy as hex string
 */
export function mnemonicToEntropy(mnemonic: string): string {
  return bip39.mnemonicToEntropy(mnemonic);
}

/**
 * Converts entropy bytes to a mnemonic
 *
 * @param entropy - Entropy as hex string
 * @returns BIP39 mnemonic phrase
 */
export function entropyToMnemonic(entropy: string): string {
  return bip39.entropyToMnemonic(entropy);
}
