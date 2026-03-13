import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  LAMPORTS_PER_SOL,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import type { TransactionDetails, TransactionHistoryOptions } from '../types.js';

/**
 * Queries and manages transaction history for wallets
 */
export class TransactionHistory {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Gets transaction history for a wallet
   */
  async getHistory(
    publicKey: string | PublicKey,
    options: TransactionHistoryOptions = {}
  ): Promise<TransactionDetails[]> {
    const { limit = 10, before, direction = 'all' } = options;

    const pubkey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;

    // Get signatures
    const signatures = await this.connection.getSignaturesForAddress(pubkey, {
      limit,
      before,
    });

    // Fetch transactions in parallel
    const transactions = await Promise.all(
      signatures.map((sig) =>
        this.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        })
      )
    );

    // Parse transactions
    const details: TransactionDetails[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const sigInfo = signatures[i];

      if (!tx) continue;

      const parsed = this.parseTransaction(tx, pubkey.toString(), sigInfo);
      if (!parsed) continue;

      // Apply direction filter
      if (
        direction === 'sent' &&
        parsed.from !== pubkey.toString()
      ) {
        continue;
      }
      if (
        direction === 'received' &&
        parsed.to !== pubkey.toString()
      ) {
        continue;
      }

      details.push(parsed);
    }

    return details;
  }

  /**
   * Gets a specific transaction by signature
   */
  async getTransaction(signature: string): Promise<TransactionDetails | null> {
    const tx = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) return null;

    return this.parseTransaction(tx, '', { signature } as ConfirmedSignatureInfo);
  }

  /**
   * Gets the latest transactions for a wallet
   */
  async getLatestTransactions(
    publicKey: string | PublicKey,
    count: number = 5
  ): Promise<TransactionDetails[]> {
    return this.getHistory(publicKey, { limit: count });
  }

  /**
   * Counts transactions for a wallet
   */
  async countTransactions(publicKey: string | PublicKey): Promise<number> {
    const pubkey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;

    // Get signatures with a high limit
    const signatures = await this.connection.getSignaturesForAddress(pubkey, {
      limit: 1000,
    });

    return signatures.length;
  }

  /**
   * Gets transaction volume for a wallet (total sent + received)
   */
  async getVolume(
    publicKey: string | PublicKey,
    limit: number = 100
  ): Promise<{ sent: number; received: number; total: number }> {
    const history = await this.getHistory(publicKey, { limit });
    const pubkeyStr =
      typeof publicKey === 'string' ? publicKey : publicKey.toString();

    let sent = 0;
    let received = 0;

    for (const tx of history) {
      if (tx.token !== 'SOL') continue; // Only count SOL for now

      if (tx.from === pubkeyStr) {
        sent += tx.amount;
      } else if (tx.to === pubkeyStr) {
        received += tx.amount;
      }
    }

    return {
      sent,
      received,
      total: sent + received,
    };
  }

  /**
   * Parses a transaction into TransactionDetails
   */
  private parseTransaction(
    tx: ParsedTransactionWithMeta,
    walletAddress: string,
    sigInfo: ConfirmedSignatureInfo
  ): TransactionDetails | null {
    if (!tx.meta) return null;

    const status = tx.meta.err ? 'failed' : 'success';

    // Try to extract SOL transfer
    const solTransfer = this.extractSolTransfer(tx);
    if (solTransfer) {
      return {
        signature: sigInfo.signature,
        from: solTransfer.from,
        to: solTransfer.to,
        amount: solTransfer.amount,
        token: 'SOL',
        timestamp: tx.blockTime || 0,
        slot: tx.slot,
        fee: tx.meta.fee,
        status,
      };
    }

    // Try to extract token transfer
    const tokenTransfer = this.extractTokenTransfer(tx);
    if (tokenTransfer) {
      return {
        signature: sigInfo.signature,
        from: tokenTransfer.from,
        to: tokenTransfer.to,
        amount: tokenTransfer.amount,
        token: tokenTransfer.token,
        timestamp: tx.blockTime || 0,
        slot: tx.slot,
        fee: tx.meta.fee,
        status,
      };
    }

    return null;
  }

  /**
   * Extracts SOL transfer from transaction
   */
  private extractSolTransfer(
    tx: ParsedTransactionWithMeta
  ): { from: string; to: string; amount: number } | null {
    const instructions = tx.transaction.message.instructions;

    for (const ix of instructions) {
      if ('parsed' in ix && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info;
        if (info.lamports) {
          return {
            from: info.source,
            to: info.destination,
            amount: info.lamports / LAMPORTS_PER_SOL,
          };
        }
      }
    }

    return null;
  }

  /**
   * Extracts token transfer from transaction
   */
  private extractTokenTransfer(
    tx: ParsedTransactionWithMeta
  ): { from: string; to: string; amount: number; token: string } | null {
    const instructions = tx.transaction.message.instructions;

    for (const ix of instructions) {
      if ('parsed' in ix && ix.parsed?.type === 'transferChecked') {
        const info = ix.parsed.info;
        return {
          from: info.authority,
          to: info.destination,
          amount: parseFloat(info.tokenAmount.uiAmountString),
          token: info.mint,
        };
      }
    }

    return null;
  }

  /**
   * Searches for transactions matching criteria
   */
  async search(
    publicKey: string | PublicKey,
    criteria: {
      minAmount?: number;
      maxAmount?: number;
      token?: string;
      startTime?: number;
      endTime?: number;
    },
    limit: number = 100
  ): Promise<TransactionDetails[]> {
    const history = await this.getHistory(publicKey, { limit });

    return history.filter((tx) => {
      if (criteria.minAmount !== undefined && tx.amount < criteria.minAmount) {
        return false;
      }
      if (criteria.maxAmount !== undefined && tx.amount > criteria.maxAmount) {
        return false;
      }
      if (criteria.token && tx.token !== criteria.token) {
        return false;
      }
      if (criteria.startTime !== undefined && tx.timestamp < criteria.startTime) {
        return false;
      }
      if (criteria.endTime !== undefined && tx.timestamp > criteria.endTime) {
        return false;
      }
      return true;
    });
  }
}
