import {
  Connection,
  PublicKey,
  Keypair,
  clusterApiUrl,
  Cluster,
} from '@solana/web3.js';
import { MoltWallet } from './wallet';

export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
  from: string;
  to: string;
  amount: number;
  timestamp: number;
}

export interface BalanceResult {
  address: string;
  balance: number;
  timestamp: number;
}

export interface AgentConfig {
  cluster?: Cluster | string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export class AgentTransactionAPI {
  private connection: Connection;
  private wallets: Map<string, MoltWallet> = new Map();

  constructor(config: AgentConfig = {}) {
    const endpoint =
      config.cluster === 'mainnet-beta' ||
      config.cluster === 'testnet' ||
      config.cluster === 'devnet'
        ? clusterApiUrl(config.cluster)
        : config.cluster ?? clusterApiUrl('devnet');

    this.connection = new Connection(endpoint, config.commitment ?? 'confirmed');
  }

  /**
   * Create a new wallet for an agent
   */
  createWallet(agentId: string): { address: string; secretKey: string } {
    const wallet = new MoltWallet(this.connection);
    this.wallets.set(agentId, wallet);

    return {
      address: wallet.address,
      secretKey: wallet.exportSecretKey(),
    };
  }

  /**
   * Load an existing wallet from a secret key
   */
  loadWallet(agentId: string, secretKey: string): { address: string } {
    const wallet = MoltWallet.fromBase58(this.connection, secretKey);
    this.wallets.set(agentId, wallet);

    return { address: wallet.address };
  }

  /**
   * Get wallet address for an agent
   */
  getAddress(agentId: string): string | null {
    return this.wallets.get(agentId)?.address ?? null;
  }

  /**
   * Check balance for an agent's wallet
   */
  async getBalance(agentId: string): Promise<BalanceResult> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) {
      throw new Error(`No wallet found for agent: ${agentId}`);
    }

    const balance = await wallet.getBalance();
    return {
      address: wallet.address,
      balance,
      timestamp: Date.now(),
    };
  }

  /**
   * Check balance for any address
   */
  async checkAddress(address: string): Promise<BalanceResult> {
    const pubkey = new PublicKey(address);
    const lamports = await this.connection.getBalance(pubkey);

    return {
      address,
      balance: lamports / 1e9,
      timestamp: Date.now(),
    };
  }

  /**
   * Send SOL from agent's wallet to a recipient
   */
  async send(
    agentId: string,
    to: string,
    amount: number
  ): Promise<TransactionResult> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) {
      throw new Error(`No wallet found for agent: ${agentId}`);
    }

    const from = wallet.address;
    const timestamp = Date.now();

    try {
      const signature = await wallet.transfer(to, amount);
      return {
        success: true,
        signature,
        from,
        to,
        amount,
        timestamp,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        from,
        to,
        amount,
        timestamp,
      };
    }
  }

  /**
   * Send SOL between two agents
   */
  async sendBetweenAgents(
    fromAgentId: string,
    toAgentId: string,
    amount: number
  ): Promise<TransactionResult> {
    const toWallet = this.wallets.get(toAgentId);
    if (!toWallet) {
      throw new Error(`No wallet found for recipient agent: ${toAgentId}`);
    }

    return this.send(fromAgentId, toWallet.address, amount);
  }

  /**
   * Request airdrop (devnet/testnet only)
   */
  async requestAirdrop(agentId: string, amount: number = 1): Promise<string> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) {
      throw new Error(`No wallet found for agent: ${agentId}`);
    }

    const signature = await this.connection.requestAirdrop(
      wallet.publicKey,
      amount * 1e9
    );

    await this.connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  /**
   * Get transaction history for an agent's wallet
   */
  async getTransactionHistory(
    agentId: string,
    limit: number = 10
  ): Promise<{ signatures: string[]; address: string }> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) {
      throw new Error(`No wallet found for agent: ${agentId}`);
    }

    const signatures = await this.connection.getSignaturesForAddress(
      wallet.publicKey,
      { limit }
    );

    return {
      address: wallet.address,
      signatures: signatures.map((s) => s.signature),
    };
  }

  /**
   * Remove wallet from memory (does not delete on-chain)
   */
  removeWallet(agentId: string): boolean {
    return this.wallets.delete(agentId);
  }

  /**
   * List all registered agent IDs
   */
  listAgents(): string[] {
    return Array.from(this.wallets.keys());
  }
}
