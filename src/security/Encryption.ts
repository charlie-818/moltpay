import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;

export interface EncryptedData {
  /** Encrypted data (base64) */
  encrypted: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Salt used for key derivation (base64) */
  salt: string;
}

/**
 * Derives a 256-bit key from a password using scrypt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

/**
 * Encrypts data using AES-256-CBC with a password-derived key
 *
 * @param data - Data to encrypt (string or Buffer)
 * @param password - Password for encryption
 * @returns Encrypted data with IV and salt for decryption
 */
export function encrypt(data: string | Buffer, password: string): EncryptedData {
  if (!password || password.length < 8) {
    throw new Error('Encryption password must be at least 8 characters');
  }

  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

  const encrypted = Buffer.concat([
    cipher.update(dataBuffer),
    cipher.final()
  ]);

  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64')
  };
}

/**
 * Decrypts data encrypted with the encrypt function
 *
 * @param encryptedData - Object containing encrypted data, IV, and salt
 * @param password - Password used for encryption
 * @returns Decrypted data as Buffer
 */
export function decrypt(encryptedData: EncryptedData, password: string): Buffer {
  if (!password) {
    throw new Error('Decryption password is required');
  }

  const salt = Buffer.from(encryptedData.salt, 'base64');
  const key = deriveKey(password, salt);
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const encrypted = Buffer.from(encryptedData.encrypted, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
}

/**
 * Decrypts data and returns as string
 */
export function decryptToString(encryptedData: EncryptedData, password: string): string {
  return decrypt(encryptedData, password).toString('utf8');
}

/**
 * Encrypts a private key for secure storage
 *
 * @param privateKey - Private key bytes (Uint8Array)
 * @param password - Password for encryption
 * @returns Encrypted private key data
 */
export function encryptPrivateKey(privateKey: Uint8Array, password: string): EncryptedData {
  return encrypt(Buffer.from(privateKey), password);
}

/**
 * Decrypts a private key from encrypted storage
 *
 * @param encryptedData - Encrypted private key data
 * @param password - Password used for encryption
 * @returns Private key as Uint8Array
 */
export function decryptPrivateKey(encryptedData: EncryptedData, password: string): Uint8Array {
  const decrypted = decrypt(encryptedData, password);
  return new Uint8Array(decrypted);
}

/**
 * Generates a secure random encryption key
 *
 * @param length - Length of the key in bytes (default 32)
 * @returns Random key as hex string
 */
export function generateEncryptionKey(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Validates an encryption key meets minimum requirements
 *
 * @param key - Key to validate
 * @returns Whether the key is valid
 */
export function isValidEncryptionKey(key: string): boolean {
  return typeof key === 'string' && key.length >= 8;
}
