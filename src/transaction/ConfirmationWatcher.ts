import {
  Connection,
  TransactionSignature,
  Commitment,
  SignatureStatus,
} from '@solana/web3.js';

export interface ConfirmationUpdate {
  /** Transaction signature */
  signature: string;
  /** Number of confirmations */
  confirmations: number | null;
  /** Current status */
  status: 'processing' | 'confirmed' | 'finalized' | 'failed';
  /** Slot number */
  slot?: number;
  /** Error if failed */
  error?: string;
}

export type ConfirmationCallback = (update: ConfirmationUpdate) => void;

/**
 * Watches transaction confirmations and provides status updates
 */
export class ConfirmationWatcher {
  private connection: Connection;
  private watchers: Map<string, NodeJS.Timeout>;
  private callbacks: Map<string, ConfirmationCallback[]>;

  constructor(connection: Connection) {
    this.connection = connection;
    this.watchers = new Map();
    this.callbacks = new Map();
  }

  /**
   * Watches a transaction for confirmation updates
   *
   * @param signature - Transaction signature to watch
   * @param callback - Callback for confirmation updates
   * @param targetCommitment - Target commitment level (default: confirmed)
   * @param pollInterval - Polling interval in ms (default: 1000)
   * @returns Unwatch function
   */
  watch(
    signature: TransactionSignature,
    callback: ConfirmationCallback,
    targetCommitment: Commitment = 'confirmed',
    pollInterval: number = 1000
  ): () => void {
    // Add callback to list
    const callbacks = this.callbacks.get(signature) || [];
    callbacks.push(callback);
    this.callbacks.set(signature, callbacks);

    // If already watching, just add the callback
    if (this.watchers.has(signature)) {
      return () => this.unwatch(signature, callback);
    }

    // Start polling
    const poll = async () => {
      try {
        const statuses = await this.connection.getSignatureStatuses([signature]);
        const status = statuses.value[0];

        if (!status) {
          this.notifyCallbacks(signature, {
            signature,
            confirmations: null,
            status: 'processing',
          });
          return;
        }

        const update = this.parseStatus(signature, status);
        this.notifyCallbacks(signature, update);

        // Stop watching if finalized or failed
        if (
          update.status === 'finalized' ||
          update.status === 'failed' ||
          (targetCommitment === 'confirmed' && update.status === 'confirmed')
        ) {
          this.stopWatching(signature);
        }
      } catch (error) {
        this.notifyCallbacks(signature, {
          signature,
          confirmations: null,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.stopWatching(signature);
      }
    };

    // Start polling
    poll(); // Initial check
    const interval = setInterval(poll, pollInterval);
    this.watchers.set(signature, interval);

    return () => this.unwatch(signature, callback);
  }

  /**
   * Watches multiple transactions
   */
  watchMany(
    signatures: TransactionSignature[],
    callback: (updates: Map<string, ConfirmationUpdate>) => void,
    targetCommitment: Commitment = 'confirmed',
    pollInterval: number = 1000
  ): () => void {
    const updates = new Map<string, ConfirmationUpdate>();

    const individualCallbacks = signatures.map((signature) => {
      return this.watch(
        signature,
        (update) => {
          updates.set(signature, update);
          callback(new Map(updates));
        },
        targetCommitment,
        pollInterval
      );
    });

    return () => {
      individualCallbacks.forEach((unwatch) => unwatch());
    };
  }

  /**
   * Waits for a transaction to reach a specific commitment level
   */
  async waitForConfirmation(
    signature: TransactionSignature,
    commitment: Commitment = 'confirmed',
    timeout: number = 60000
  ): Promise<ConfirmationUpdate> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.stopWatching(signature);
        reject(new Error('Confirmation timeout'));
      }, timeout);

      this.watch(
        signature,
        (update) => {
          if (
            update.status === 'failed' ||
            (commitment === 'confirmed' && update.status === 'confirmed') ||
            update.status === 'finalized'
          ) {
            clearTimeout(timeoutId);
            resolve(update);
          }
        },
        commitment
      );
    });
  }

  /**
   * Gets the current status of a transaction
   */
  async getStatus(signature: TransactionSignature): Promise<ConfirmationUpdate> {
    const statuses = await this.connection.getSignatureStatuses([signature]);
    const status = statuses.value[0];

    if (!status) {
      return {
        signature,
        confirmations: null,
        status: 'processing',
      };
    }

    return this.parseStatus(signature, status);
  }

  /**
   * Checks if a transaction is confirmed
   */
  async isConfirmed(signature: TransactionSignature): Promise<boolean> {
    const status = await this.getStatus(signature);
    return status.status === 'confirmed' || status.status === 'finalized';
  }

  /**
   * Checks if a transaction is finalized
   */
  async isFinalized(signature: TransactionSignature): Promise<boolean> {
    const status = await this.getStatus(signature);
    return status.status === 'finalized';
  }

  /**
   * Removes a specific callback
   */
  private unwatch(signature: string, callback: ConfirmationCallback): void {
    const callbacks = this.callbacks.get(signature);
    if (!callbacks) return;

    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }

    // If no more callbacks, stop watching
    if (callbacks.length === 0) {
      this.stopWatching(signature);
    }
  }

  /**
   * Stops watching a transaction
   */
  private stopWatching(signature: string): void {
    const interval = this.watchers.get(signature);
    if (interval) {
      clearInterval(interval);
      this.watchers.delete(signature);
    }
    this.callbacks.delete(signature);
  }

  /**
   * Stops all watchers
   */
  stopAll(): void {
    this.watchers.forEach((interval) => clearInterval(interval));
    this.watchers.clear();
    this.callbacks.clear();
  }

  /**
   * Parses signature status to confirmation update
   */
  private parseStatus(
    signature: string,
    status: SignatureStatus
  ): ConfirmationUpdate {
    if (status.err) {
      return {
        signature,
        confirmations: status.confirmations,
        status: 'failed',
        slot: status.slot,
        error: JSON.stringify(status.err),
      };
    }

    let confirmationStatus: ConfirmationUpdate['status'] = 'processing';

    if (status.confirmationStatus === 'finalized') {
      confirmationStatus = 'finalized';
    } else if (status.confirmationStatus === 'confirmed') {
      confirmationStatus = 'confirmed';
    }

    return {
      signature,
      confirmations: status.confirmations,
      status: confirmationStatus,
      slot: status.slot,
    };
  }

  /**
   * Notifies all callbacks for a signature
   */
  private notifyCallbacks(signature: string, update: ConfirmationUpdate): void {
    const callbacks = this.callbacks.get(signature);
    if (callbacks) {
      callbacks.forEach((cb) => cb(update));
    }
  }
}
