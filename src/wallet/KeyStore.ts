import * as crypto from 'crypto';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { WalletError, EncryptionConfig } from '../types';

const DEFAULT_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

export class KeyStore {
  private algorithm: string;

  constructor(algorithm: string = DEFAULT_ALGORITHM) {
    this.algorithm = algorithm;
  }

  /**
   * Encrypt a private key using AES-256-CBC
   */
  encryptPrivateKey(privateKey: Uint8Array, encryptionKey: string): string {
    const key = this.deriveKey(encryptionKey);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const privateKeyBase58 = bs58.encode(privateKey);
    
    let encrypted = cipher.update(privateKeyBase58, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Prepend IV to encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt an encrypted private key
   */
  decryptPrivateKey(encryptedData: string, encryptionKey: string): Uint8Array {
    const key = this.deriveKey(encryptionKey);
    
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new WalletError('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return bs58.decode(decrypted);
  }

  /**
   * Restore a Keypair from encrypted private key
   */
  restoreKeypair(encryptedData: string, encryptionKey: string): Keypair {
    const privateKey = this.decryptPrivateKey(encryptedData, encryptionKey);
    return Keypair.fromSecretKey(privateKey);
  }

  /**
   * Derive a fixed-length key from the encryption key
   */
  private deriveKey(encryptionKey: string): Buffer {
    // Use SHA-256 to derive a 32-byte key from any input
    return crypto.createHash('sha256').update(encryptionKey).digest();
  }

  /**
   * Verify that an encrypted key can be decrypted
   */
  verifyEncryptedKey(encryptedData: string, encryptionKey: string): boolean {
    try {
      this.decryptPrivateKey(encryptedData, encryptionKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Re-encrypt a private key with a new encryption key
   */
  reencrypt(
    encryptedData: string,
    oldEncryptionKey: string,
    newEncryptionKey: string
  ): string {
    const privateKey = this.decryptPrivateKey(encryptedData, oldEncryptionKey);
    return this.encryptPrivateKey(privateKey, newEncryptionKey);
  }
}

export default KeyStore;
