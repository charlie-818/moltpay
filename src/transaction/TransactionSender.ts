import {
  Connection,
  Keypair,
  Transaction,
  TransactionSignature,
  SendOptions,
  Commitment,
} from '@solana/web3.js';
import type { TransactionResult } from '../types.js';

export interface SendTransactionOptions {
  /** Commitment level to use for confirmation */
  commitment?: Commitment;
  /** Skip preflight transaction checks */
  skipPreflight?: boolean;
  /** Maximum retries for sending */
  maxRetries?: number;
  /** Timeout for confirmation (ms) */
  confirmationTimeout?: number;
}

const DEFAULT_OPTIONS: SendTransactionOptions = {
  commitment: 'confirmed',
  skipPreflight: false,
  maxRetries: 3,
  confirmationTimeout: 60000,
};

/**
 * Handles signing and sending Solana transactions with confirmation
 */
export class TransactionSender {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Signs a transaction with the provided keypair(s)
   */
  sign(transaction: Transaction, signers: Keypair[]): Transaction {
    if (signers.length === 0) {
      throw new Error('At least one signer is required');
    }

    transaction.sign(...signers);
    return transaction;
  }

  /**
   * Sends a signed transaction to the network
   */
  async send(
    transaction: Transaction,
    options: SendTransactionOptions = {}
  ): Promise<TransactionSignature> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const sendOptions: SendOptions = {
      skipPreflight: opts.skipPreflight,
      maxRetries: opts.maxRetries,
      preflightCommitment: opts.commitment,
    };

    const signature = await this.connection.sendRawTransaction(
      transaction.serialize(),
      sendOptions
    );

    return signature;
  }

  /**
   * Signs and sends a transaction in one step
   */
  async signAndSend(
    transaction: Transaction,
    signers: Keypair[],
    options: SendTransactionOptions = {}
  ): Promise<TransactionSignature> {
    this.sign(transaction, signers);
    return this.send(transaction, options);
  }

  /**
   * Waits for transaction confirmation
   */
  async confirmTransaction(
    signature: TransactionSignature,
    commitment: Commitment = 'confirmed',
    timeout: number = 60000
  ): Promise<TransactionResult> {
    const startTime = Date.now();

    // Get the latest blockhash for confirmation
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash(commitment);

    try {
      const result = await this.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        commitment
      );

      if (result.value.err) {
        return {
          signature,
          status: 'failed',
          error: JSON.stringify(result.value.err),
        };
      }

      // Get transaction details for timestamp and slot
      const txInfo = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
      });

      return {
        signature,
        status: commitment === 'finalized' ? 'finalized' : 'confirmed',
        timestamp: txInfo?.blockTime || undefined,
        slot: txInfo?.slot,
        fee: txInfo?.meta?.fee,
      };
    } catch (error) {
      // Check if we've exceeded timeout
      if (Date.now() - startTime > timeout) {
        return {
          signature,
          status: 'failed',
          error: 'Transaction confirmation timeout',
        };
      }

      return {
        signature,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Signs, sends, and confirms a transaction
   */
  async signSendAndConfirm(
    transaction: Transaction,
    signers: Keypair[],
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const signature = await this.signAndSend(transaction, signers, opts);

    return this.confirmTransaction(
      signature,
      opts.commitment,
      opts.confirmationTimeout
    );
  }

  /**
   * Simulates a transaction without sending
   */
  async simulate(
    transaction: Transaction,
    signers?: Keypair[]
  ): Promise<{
    success: boolean;
    logs: string[];
    unitsConsumed?: number;
    error?: string;
  }> {
    // Sign if signers provided
    if (signers && signers.length > 0) {
      transaction.sign(...signers);
    }

    const result = await this.connection.simulateTransaction(transaction);

    return {
      success: result.value.err === null,
      logs: result.value.logs || [],
      unitsConsumed: result.value.unitsConsumed,
      error: result.value.err ? JSON.stringify(result.value.err) : undefined,
    };
  }

  /**
   * Gets the connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }
}
