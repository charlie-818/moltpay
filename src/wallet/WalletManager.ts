import { 
  Connection, 
  Keypair, 
  PublicKey, 
  LAMPORTS_PER_SOL,
  clusterApiUrl 
} from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { 
  MoltWallet, 
  HDWallet, 
  WalletConfig, 
  HDWalletConfig,
  WalletBalance,
  TokenBalance,
  WalletError,
  MoltPayConfig,
  DEVNET_TOKENS,
  WHITELISTED_TOKENS
} from '../types';
import { KeyStore } from './KeyStore';
import { HDDerivation } from './HDDerivation';

export class WalletManager {
  private connection: Connection;
  private keyStore: KeyStore;
  private encryptionKey?: string;

  constructor(config: MoltPayConfig) {
    const endpoint = config.rpcEndpoint || clusterApiUrl(config.network);
    this.connection = new Connection(endpoint, config.commitment || 'confirmed');
    this.keyStore = new KeyStore();
    this.encryptionKey = config.encryptionKey;
  }

  /**
   * Create a new wallet with a randomly generated keypair
   */
  async createWallet(config?: WalletConfig): Promise<MoltWallet> {
    const keypair = Keypair.generate();
    const encryptionKey = config?.encryption?.key || this.encryptionKey;

    if (!encryptionKey) {
      throw new WalletError('Encryption key is required');
    }

    const encryptedPrivateKey = this.keyStore.encryptPrivateKey(
      keypair.secretKey,
      encryptionKey
    );

    return {
      publicKey: keypair.publicKey.toBase58(),
      encryptedPrivateKey,
      createdAt: Date.now(),
    };
  }

  /**
   * Create an HD wallet from a mnemonic phrase
   */
  async createHDWallet(config?: HDWalletConfig): Promise<HDWallet> {
    const mnemonic = config?.mnemonic || HDDerivation.generateMnemonic();
    const derivationPath = config?.derivationPath || HDDerivation.getDerivationPath(0);
    const encryptionKey = config?.encryption?.key || this.encryptionKey;

    if (!encryptionKey) {
      throw new WalletError('Encryption key is required');
    }

    const keypair = HDDerivation.deriveKeypair(mnemonic, 0, derivationPath);
    const encryptedPrivateKey = this.keyStore.encryptPrivateKey(
      keypair.secretKey,
      encryptionKey
    );

    return {
      publicKey: keypair.publicKey.toBase58(),
      encryptedPrivateKey,
      createdAt: Date.now(),
      mnemonic, // Note: In production, encrypt the mnemonic too
      derivationPath,
      index: 0,
    };
  }

  /**
   * Derive additional wallets from an HD wallet
   */
  async deriveWallet(
    hdWallet: HDWallet,
    index: number,
    encryptionKey?: string
  ): Promise<HDWallet> {
    const key = encryptionKey || this.encryptionKey;
    if (!key) {
      throw new WalletError('Encryption key is required');
    }

    const derivationPath = HDDerivation.getDerivationPath(index);
    const keypair = HDDerivation.deriveKeypair(hdWallet.mnemonic, index);
    const encryptedPrivateKey = this.keyStore.encryptPrivateKey(
      keypair.secretKey,
      key
    );

    return {
      publicKey: keypair.publicKey.toBase58(),
      encryptedPrivateKey,
      createdAt: Date.now(),
      mnemonic: hdWallet.mnemonic,
      derivationPath,
      index,
    };
  }

  /**
   * Import a wallet from a private key (base58 encoded)
   */
  async importWallet(
    privateKeyBase58: string,
    encryptionKey?: string
  ): Promise<MoltWallet> {
    const key = encryptionKey || this.encryptionKey;
    if (!key) {
      throw new WalletError('Encryption key is required');
    }

    try {
      const { default: bs58 } = await import('bs58');
      const privateKey = bs58.decode(privateKeyBase58);
      const keypair = Keypair.fromSecretKey(privateKey);
      
      const encryptedPrivateKey = this.keyStore.encryptPrivateKey(
        keypair.secretKey,
        key
      );

      return {
        publicKey: keypair.publicKey.toBase58(),
        encryptedPrivateKey,
        createdAt: Date.now(),
      };
    } catch (error) {
      throw new WalletError('Invalid private key format', { error });
    }
  }

  /**
   * Get the keypair from an encrypted wallet
   */
  getKeypair(wallet: MoltWallet, encryptionKey?: string): Keypair {
    const key = encryptionKey || this.encryptionKey;
    if (!key) {
      throw new WalletError('Encryption key is required');
    }

    return this.keyStore.restoreKeypair(wallet.encryptedPrivateKey, key);
  }

  /**
   * Get the SOL balance for a wallet
   */
  async getBalance(publicKey: string): Promise<WalletBalance> {
    const pubkey = new PublicKey(publicKey);
    const lamports = await this.connection.getBalance(pubkey);
    const sol = lamports / LAMPORTS_PER_SOL;

    const tokens = await this.getTokenBalances(publicKey);

    return {
      sol,
      tokens,
    };
  }

  /**
   * Get SPL token balances for a wallet
   */
  async getTokenBalances(publicKey: string): Promise<TokenBalance[]> {
    const pubkey = new PublicKey(publicKey);
    const tokenBalances: TokenBalance[] = [];

    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      pubkey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );

    for (const { account } of tokenAccounts.value) {
      const parsedInfo = account.data.parsed.info;
      const mintAddress = parsedInfo.mint;
      const balance = parsedInfo.tokenAmount.uiAmount;
      const decimals = parsedInfo.tokenAmount.decimals;

      // Find symbol from whitelist
      const tokenInfo = Object.values({ ...WHITELISTED_TOKENS, ...DEVNET_TOKENS })
        .find(t => t.mint === mintAddress);

      tokenBalances.push({
        mint: mintAddress,
        symbol: tokenInfo?.symbol,
        balance: balance || 0,
        decimals,
      });
    }

    return tokenBalances;
  }

  /**
   * Check if a wallet exists on-chain (has any transactions)
   */
  async walletExists(publicKey: string): Promise<boolean> {
    const pubkey = new PublicKey(publicKey);
    const accountInfo = await this.connection.getAccountInfo(pubkey);
    return accountInfo !== null;
  }

  /**
   * Request an airdrop (devnet only)
   */
  async requestAirdrop(publicKey: string, amount: number = 1): Promise<string> {
    const pubkey = new PublicKey(publicKey);
    const lamports = amount * LAMPORTS_PER_SOL;
    
    const signature = await this.connection.requestAirdrop(pubkey, lamports);
    await this.connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  }

  /**
   * Get the connection instance for advanced operations
   */
  getConnection(): Connection {
    return this.connection;
  }
}

export default WalletManager;
