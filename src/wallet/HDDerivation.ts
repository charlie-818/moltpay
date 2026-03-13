import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { WalletError } from '../types';

const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

export class HDDerivation {
  /**
   * Generate a new BIP39 mnemonic phrase
   */
  static generateMnemonic(strength: 128 | 256 = 128): string {
    return bip39.generateMnemonic(strength);
  }

  /**
   * Validate a mnemonic phrase
   */
  static validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic);
  }

  /**
   * Derive a Solana keypair from a mnemonic phrase
   * Uses BIP44 path: m/44'/501'/0'/0' (standard Solana path)
   */
  static deriveKeypair(
    mnemonic: string,
    index: number = 0,
    customPath?: string
  ): Keypair {
    if (!this.validateMnemonic(mnemonic)) {
      throw new WalletError('Invalid mnemonic phrase');
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const path = customPath || this.getDerivationPath(index);
    
    const derivedSeed = derivePath(path, seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
  }

  /**
   * Get the derivation path for a given account index
   */
  static getDerivationPath(index: number): string {
    return `m/44'/501'/${index}'/0'`;
  }

  /**
   * Derive multiple keypairs from a single mnemonic
   */
  static deriveMultipleKeypairs(
    mnemonic: string,
    count: number,
    startIndex: number = 0
  ): Keypair[] {
    const keypairs: Keypair[] = [];
    for (let i = startIndex; i < startIndex + count; i++) {
      keypairs.push(this.deriveKeypair(mnemonic, i));
    }
    return keypairs;
  }

  /**
   * Convert mnemonic to seed (for advanced use cases)
   */
  static mnemonicToSeed(mnemonic: string): Buffer {
    if (!this.validateMnemonic(mnemonic)) {
      throw new WalletError('Invalid mnemonic phrase');
    }
    return bip39.mnemonicToSeedSync(mnemonic);
  }
}

export default HDDerivation;
