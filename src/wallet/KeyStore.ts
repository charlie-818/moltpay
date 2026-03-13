import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  encrypt,
  decrypt,
  encryptPrivateKey,
  decryptPrivateKey,
  type EncryptedData,
} from '../security/Encryption.js';
import type { WalletInfo, HDWalletInfo } from '../types.js';

/**
 * Encrypts a keypair's private key for secure storage
 *
 * @param keypair - Solana Keypair to encrypt
 * @param password - Encryption password
 * @returns Wallet info with encrypted private key
 */
export function encryptKeypair(keypair: Keypair, password: string): WalletInfo {
  const encrypted = encryptPrivateKey(keypair.secretKey, password);

  return {
    publicKey: keypair.publicKey.toBase58(),
    encryptedPrivateKey: encrypted.encrypted,
    iv: encrypted.iv,
    createdAt: Date.now(),
  };
}

/**
 * Decrypts a wallet info back to a keypair
 *
 * @param walletInfo - Wallet info with encrypted private key
 * @param password - Decryption password
 * @returns Solana Keypair
 */
export function decryptKeypair(walletInfo: WalletInfo, password: string): Keypair {
  // We need the salt which should be stored with the wallet info
  // For backwards compatibility, check if salt exists
  const walletWithSalt = walletInfo as WalletInfo & { salt?: string };

  if (!walletWithSalt.salt) {
    throw new Error('Wallet info missing encryption salt. Please re-encrypt the wallet.');
  }

  const encryptedData: EncryptedData = {
    encrypted: walletInfo.encryptedPrivateKey,
    iv: walletInfo.iv,
    salt: walletWithSalt.salt,
  };

  const secretKey = decryptPrivateKey(encryptedData, password);
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Creates wallet info with salt included
 *
 * @param keypair - Solana Keypair to encrypt
 * @param password - Encryption password
 * @returns Wallet info with encrypted private key and salt
 */
export function createWalletInfo(keypair: Keypair, password: string): WalletInfo & { salt: string } {
  const encrypted = encryptPrivateKey(keypair.secretKey, password);

  return {
    publicKey: keypair.publicKey.toBase58(),
    encryptedPrivateKey: encrypted.encrypted,
    iv: encrypted.iv,
    salt: encrypted.salt,
    createdAt: Date.now(),
  };
}

/**
 * Creates HD wallet info with derivation details
 *
 * @param keypair - Solana Keypair to encrypt
 * @param password - Encryption password
 * @param derivationPath - BIP44 derivation path used
 * @param accountIndex - Account index
 * @returns HD wallet info
 */
export function createHDWalletInfo(
  keypair: Keypair,
  password: string,
  derivationPath: string,
  accountIndex: number
): HDWalletInfo & { salt: string } {
  const baseInfo = createWalletInfo(keypair, password);

  return {
    ...baseInfo,
    derivationPath,
    accountIndex,
  };
}

/**
 * Exports a keypair to base58-encoded secret key
 * WARNING: This returns the raw secret key. Handle with care.
 *
 * @param keypair - Keypair to export
 * @returns Base58-encoded secret key
 */
export function exportSecretKey(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}

/**
 * Imports a keypair from base58-encoded secret key
 *
 * @param secretKeyBase58 - Base58-encoded secret key
 * @returns Solana Keypair
 */
export function importSecretKey(secretKeyBase58: string): Keypair {
  const secretKey = bs58.decode(secretKeyBase58);
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Imports a keypair from a Uint8Array or number array (JSON format)
 *
 * @param secretKey - Secret key as array
 * @returns Solana Keypair
 */
export function importSecretKeyArray(secretKey: Uint8Array | number[]): Keypair {
  const keyArray = secretKey instanceof Uint8Array ? secretKey : new Uint8Array(secretKey);
  return Keypair.fromSecretKey(keyArray);
}

/**
 * Validates that a public key matches a keypair
 *
 * @param publicKeyBase58 - Expected public key in base58
 * @param keypair - Keypair to validate
 * @returns Whether the public key matches
 */
export function validateKeypair(publicKeyBase58: string, keypair: Keypair): boolean {
  return keypair.publicKey.toBase58() === publicKeyBase58;
}

/**
 * Checks if a wallet info object is valid
 *
 * @param walletInfo - Wallet info to validate
 * @returns Whether the wallet info is valid
 */
export function isValidWalletInfo(walletInfo: unknown): walletInfo is WalletInfo {
  if (typeof walletInfo !== 'object' || walletInfo === null) {
    return false;
  }

  const info = walletInfo as Record<string, unknown>;

  return (
    typeof info.publicKey === 'string' &&
    typeof info.encryptedPrivateKey === 'string' &&
    typeof info.iv === 'string' &&
    typeof info.createdAt === 'number'
  );
}

/**
 * Serializes wallet info to JSON string
 *
 * @param walletInfo - Wallet info to serialize
 * @returns JSON string
 */
export function serializeWalletInfo(walletInfo: WalletInfo): string {
  return JSON.stringify(walletInfo);
}

/**
 * Deserializes wallet info from JSON string
 *
 * @param json - JSON string
 * @returns Wallet info
 */
export function deserializeWalletInfo(json: string): WalletInfo {
  const parsed = JSON.parse(json);

  if (!isValidWalletInfo(parsed)) {
    throw new Error('Invalid wallet info JSON');
  }

  return parsed;
}
