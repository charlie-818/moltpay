import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Stored wallet info with encrypted private key
 */
export interface StoredWallet {
  publicKey: string;
  encryptedPrivateKey: string;
  iv: string;
  salt: string;
  createdAt: number;
  label?: string;
}

/**
 * Persistent wallet store for MCP server
 *
 * Stores wallets in ~/.moltpay/wallets.json
 * Private keys are encrypted with the MOLTPAY_ENCRYPTION_KEY
 */
export class WalletStore {
  private storePath: string;
  private wallets: Map<string, StoredWallet> = new Map();

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(os.homedir(), '.moltpay', 'wallets.json');
    this.load();
  }

  /**
   * Load wallets from disk
   */
  private load(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.storePath)) {
        const data = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
        if (Array.isArray(data.wallets)) {
          for (const wallet of data.wallets) {
            this.wallets.set(wallet.publicKey, wallet);
          }
        }
      }
    } catch (error) {
      // Ignore load errors, start fresh
      this.wallets = new Map();
    }
  }

  /**
   * Save wallets to disk
   */
  private save(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        version: 1,
        updatedAt: Date.now(),
        wallets: Array.from(this.wallets.values()),
      };

      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save wallets:', error);
    }
  }

  /**
   * Add a wallet to the store
   */
  addWallet(wallet: StoredWallet): void {
    this.wallets.set(wallet.publicKey, wallet);
    this.save();
  }

  /**
   * Get a wallet by public key
   */
  getWallet(publicKey: string): StoredWallet | undefined {
    return this.wallets.get(publicKey);
  }

  /**
   * List all wallets
   */
  listWallets(): StoredWallet[] {
    return Array.from(this.wallets.values());
  }

  /**
   * Remove a wallet
   */
  removeWallet(publicKey: string): boolean {
    const deleted = this.wallets.delete(publicKey);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  /**
   * Get the most recently created wallet
   */
  getLatestWallet(): StoredWallet | undefined {
    let latest: StoredWallet | undefined;
    for (const wallet of this.wallets.values()) {
      if (!latest || wallet.createdAt > latest.createdAt) {
        latest = wallet;
      }
    }
    return latest;
  }

  /**
   * Get wallet count
   */
  getCount(): number {
    return this.wallets.size;
  }
}
