import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import type {
  WalletConfig,
  WalletInfo,
  HDWalletConfig,
  HDWalletInfo,
  Balance,
  TokenBalance,
  DEVNET_TOKEN_MINTS,
  SupportedToken,
} from '../types.js';
import {
  generateMnemonic,
  validateMnemonic,
  keypairFromMnemonic,
  deriveMultipleKeypairs,
  getDerivationPath,
} from './HDDerivation.js';
import {
  createWalletInfo,
  createHDWalletInfo,
  decryptKeypair,
  importSecretKey,
  importSecretKeyArray,
} from './KeyStore.js';

const DEFAULT_RPC_ENDPOINT = clusterApiUrl('devnet');

// Known token symbols for display
const TOKEN_SYMBOLS: Record<string, string> = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': 'USDC', // Devnet
  'EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS': 'USDT', // Devnet
};

/**
 * Wallet manager for creating, importing, and managing Solana wallets
 */
export class WalletManager {
  private connection: Connection;
  private encryptionKey?: string;

  constructor(config: WalletConfig = {}) {
    this.connection = new Connection(
      config.rpcEndpoint || DEFAULT_RPC_ENDPOINT,
      'confirmed'
    );
    this.encryptionKey = config.encryptionKey;
  }

  /**
   * Creates a new random wallet
   *
   * @param password - Optional password override (uses config encryptionKey if not provided)
   * @returns Encrypted wallet info
   */
  createWallet(password?: string): WalletInfo & { salt: string } {
    const pwd = password || this.encryptionKey;
    if (!pwd) {
      throw new Error('Encryption key required. Provide password or set encryptionKey in config.');
    }

    const keypair = Keypair.generate();
    return createWalletInfo(keypair, pwd);
  }

  /**
   * Creates a new HD wallet with mnemonic
   *
   * @param config - HD wallet configuration
   * @returns HD wallet info with mnemonic
   */
  createHDWallet(config: HDWalletConfig = {}): {
    wallet: HDWalletInfo & { salt: string };
    mnemonic: string;
  } {
    const pwd = config.encryptionKey || this.encryptionKey;
    if (!pwd) {
      throw new Error('Encryption key required.');
    }

    const mnemonic = config.mnemonic || generateMnemonic();
    const accountIndex = config.accountIndex ?? 0;
    const derivationPath = config.derivationPath || getDerivationPath(accountIndex);

    const keypair = keypairFromMnemonic(mnemonic, accountIndex);
    const wallet = createHDWalletInfo(keypair, pwd, derivationPath, accountIndex);

    return { wallet, mnemonic };
  }

  /**
   * Imports a wallet from mnemonic phrase
   *
   * @param mnemonic - BIP39 mnemonic phrase
   * @param accountIndex - Account index to derive (default: 0)
   * @param password - Optional password override
   * @returns Encrypted wallet info
   */
  importFromMnemonic(
    mnemonic: string,
    accountIndex: number = 0,
    password?: string
  ): HDWalletInfo & { salt: string } {
    const pwd = password || this.encryptionKey;
    if (!pwd) {
      throw new Error('Encryption key required.');
    }

    if (!validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    const derivationPath = getDerivationPath(accountIndex);
    const keypair = keypairFromMnemonic(mnemonic, accountIndex);

    return createHDWalletInfo(keypair, pwd, derivationPath, accountIndex);
  }

  /**
   * Imports a wallet from base58-encoded secret key
   *
   * @param secretKeyBase58 - Base58-encoded secret key
   * @param password - Optional password override
   * @returns Encrypted wallet info
   */
  importFromSecretKey(
    secretKeyBase58: string,
    password?: string
  ): WalletInfo & { salt: string } {
    const pwd = password || this.encryptionKey;
    if (!pwd) {
      throw new Error('Encryption key required.');
    }

    const keypair = importSecretKey(secretKeyBase58);
    return createWalletInfo(keypair, pwd);
  }

  /**
   * Imports a wallet from secret key array (JSON format)
   *
   * @param secretKey - Secret key as number array
   * @param password - Optional password override
   * @returns Encrypted wallet info
   */
  importFromSecretKeyArray(
    secretKey: number[],
    password?: string
  ): WalletInfo & { salt: string } {
    const pwd = password || this.encryptionKey;
    if (!pwd) {
      throw new Error('Encryption key required.');
    }

    const keypair = importSecretKeyArray(secretKey);
    return createWalletInfo(keypair, pwd);
  }

  /**
   * Decrypts a wallet to get the keypair
   *
   * @param walletInfo - Encrypted wallet info
   * @param password - Optional password override
   * @returns Decrypted keypair
   */
  decryptWallet(walletInfo: WalletInfo, password?: string): Keypair {
    const pwd = password || this.encryptionKey;
    if (!pwd) {
      throw new Error('Decryption password required.');
    }

    return decryptKeypair(walletInfo, pwd);
  }

  /**
   * Derives multiple wallets from a mnemonic
   *
   * @param mnemonic - BIP39 mnemonic phrase
   * @param count - Number of wallets to derive
   * @param startIndex - Starting account index
   * @param password - Optional password override
   * @returns Array of encrypted wallet infos
   */
  deriveMultipleWallets(
    mnemonic: string,
    count: number,
    startIndex: number = 0,
    password?: string
  ): (HDWalletInfo & { salt: string })[] {
    const pwd = password || this.encryptionKey;
    if (!pwd) {
      throw new Error('Encryption key required.');
    }

    const keypairs = deriveMultipleKeypairs(mnemonic, count, startIndex);

    return keypairs.map((keypair, i) => {
      const accountIndex = startIndex + i;
      const derivationPath = getDerivationPath(accountIndex);
      return createHDWalletInfo(keypair, pwd, derivationPath, accountIndex);
    });
  }

  /**
   * Gets the SOL and token balance for a wallet
   *
   * @param publicKey - Wallet public key (string or PublicKey)
   * @param tokenMints - Optional list of token mints to check
   * @returns Balance information
   */
  async getBalance(
    publicKey: string | PublicKey,
    tokenMints: string[] = []
  ): Promise<Balance> {
    const pubkey = typeof publicKey === 'string'
      ? new PublicKey(publicKey)
      : publicKey;

    // Get SOL balance
    const lamports = await this.connection.getBalance(pubkey);
    const sol = lamports / LAMPORTS_PER_SOL;

    // Get token balances
    const tokens: TokenBalance[] = [];

    for (const mint of tokenMints) {
      try {
        const mintPubkey = new PublicKey(mint);
        const ata = await getAssociatedTokenAddress(mintPubkey, pubkey);

        try {
          const account = await getAccount(this.connection, ata);
          const mintInfo = await getMint(this.connection, mintPubkey);

          tokens.push({
            mint,
            symbol: TOKEN_SYMBOLS[mint],
            amount: account.amount,
            decimals: mintInfo.decimals,
            uiAmount: Number(account.amount) / Math.pow(10, mintInfo.decimals),
          });
        } catch {
          // Token account doesn't exist, balance is 0
          const mintInfo = await getMint(this.connection, mintPubkey);
          tokens.push({
            mint,
            symbol: TOKEN_SYMBOLS[mint],
            amount: BigInt(0),
            decimals: mintInfo.decimals,
            uiAmount: 0,
          });
        }
      } catch (error) {
        // Skip invalid mints
        console.warn(`Failed to get balance for mint ${mint}:`, error);
      }
    }

    return {
      lamports: BigInt(lamports),
      sol,
      tokens,
    };
  }

  /**
   * Checks if a wallet has sufficient balance
   *
   * @param publicKey - Wallet public key
   * @param amount - Required amount in SOL
   * @returns Whether the wallet has sufficient balance
   */
  async hasSufficientBalance(
    publicKey: string | PublicKey,
    amount: number
  ): Promise<boolean> {
    const balance = await this.getBalance(publicKey);
    return balance.sol >= amount;
  }

  /**
   * Requests an airdrop on devnet (for testing)
   *
   * @param publicKey - Wallet public key
   * @param amount - Amount in SOL (max 2)
   * @returns Airdrop transaction signature
   */
  async requestAirdrop(
    publicKey: string | PublicKey,
    amount: number = 1
  ): Promise<string> {
    if (amount > 2) {
      throw new Error('Airdrop amount cannot exceed 2 SOL');
    }

    const pubkey = typeof publicKey === 'string'
      ? new PublicKey(publicKey)
      : publicKey;

    const signature = await this.connection.requestAirdrop(
      pubkey,
      amount * LAMPORTS_PER_SOL
    );

    // Wait for confirmation
    await this.connection.confirmTransaction(signature, 'confirmed');

    return signature;
  }

  /**
   * Gets the connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Updates the RPC endpoint
   *
   * @param endpoint - New RPC endpoint URL
   */
  setRpcEndpoint(endpoint: string): void {
    this.connection = new Connection(endpoint, 'confirmed');
  }

  /**
   * Updates the encryption key
   *
   * @param key - New encryption key
   */
  setEncryptionKey(key: string): void {
    this.encryptionKey = key;
  }
}
