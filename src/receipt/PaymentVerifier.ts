import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import type {
  VerifyPaymentOptions,
  PaymentReceipt,
  SupportedToken,
} from '../types.js';
import { TOKEN_MINTS, DEVNET_TOKEN_MINTS } from '../types.js';

/**
 * Token information extracted from a transaction
 */
interface TokenTransferInfo {
  mint: string;
  amount: number;
  decimals: number;
  from: string;
  to: string;
}

/**
 * Payment verifier for on-chain transaction verification
 */
export class PaymentVerifier {
  private connection: Connection;
  private useDevnet: boolean;
  private tokenSymbols: Map<string, string>;

  constructor(connection: Connection, useDevnet: boolean = true) {
    this.connection = connection;
    this.useDevnet = useDevnet;

    // Build reverse lookup for token symbols
    this.tokenSymbols = new Map();
    const mints = useDevnet ? DEVNET_TOKEN_MINTS : TOKEN_MINTS;
    for (const [symbol, mint] of Object.entries(mints)) {
      this.tokenSymbols.set(mint, symbol);
    }
  }

  /**
   * Verifies a payment transaction on-chain
   */
  async verifyPayment(options: VerifyPaymentOptions): Promise<PaymentReceipt> {
    const {
      signature,
      expectedRecipient,
      expectedAmount,
      expectedToken,
      tolerance = 0.01,
    } = options;

    // Fetch transaction
    const tx = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return this.createFailedReceipt(signature, ['Transaction not found']);
    }

    if (tx.meta?.err) {
      return this.createFailedReceipt(signature, [
        `Transaction failed: ${JSON.stringify(tx.meta.err)}`,
      ]);
    }

    // Extract transfer details
    const transfer = this.extractTransferDetails(tx);

    if (!transfer) {
      return this.createFailedReceipt(signature, ['No transfer found in transaction']);
    }

    // Build receipt
    const receipt: PaymentReceipt = {
      verified: true,
      signature,
      from: transfer.from,
      to: transfer.to,
      amount: transfer.amount,
      token: transfer.token,
      timestamp: tx.blockTime || 0,
      slot: tx.slot,
      failures: [],
      receiptId: this.generateReceiptId(signature, tx.blockTime || 0),
    };

    // Verify expected recipient
    if (expectedRecipient && transfer.to !== expectedRecipient) {
      receipt.failures!.push(
        `Recipient mismatch: expected ${expectedRecipient}, got ${transfer.to}`
      );
      receipt.verified = false;
    }

    // Verify expected amount
    if (expectedAmount !== undefined) {
      const diff = Math.abs(transfer.amount - expectedAmount);
      const maxDiff = expectedAmount * tolerance;

      if (diff > maxDiff) {
        receipt.failures!.push(
          `Amount mismatch: expected ${expectedAmount} ± ${tolerance * 100}%, got ${transfer.amount}`
        );
        receipt.verified = false;
      }
    }

    // Verify expected token
    if (expectedToken) {
      const resolvedToken = this.resolveTokenSymbol(expectedToken);
      if (transfer.token !== resolvedToken && transfer.token !== expectedToken) {
        receipt.failures!.push(
          `Token mismatch: expected ${expectedToken}, got ${transfer.token}`
        );
        receipt.verified = false;
      }
    }

    // Clean up empty failures array
    if (receipt.failures!.length === 0) {
      delete receipt.failures;
    }

    return receipt;
  }

  /**
   * Extracts transfer details from a parsed transaction
   */
  private extractTransferDetails(
    tx: ParsedTransactionWithMeta
  ): { from: string; to: string; amount: number; token: string } | null {
    if (!tx.meta) return null;

    // Check for SPL token transfers first
    const tokenTransfer = this.extractTokenTransfer(tx);
    if (tokenTransfer) {
      const symbol = this.tokenSymbols.get(tokenTransfer.mint) || tokenTransfer.mint;
      return {
        from: tokenTransfer.from,
        to: tokenTransfer.to,
        amount: tokenTransfer.amount,
        token: symbol,
      };
    }

    // Check for SOL transfers
    const solTransfer = this.extractSolTransfer(tx);
    if (solTransfer) {
      return {
        ...solTransfer,
        token: 'SOL',
      };
    }

    return null;
  }

  /**
   * Extracts SPL token transfer from transaction
   */
  private extractTokenTransfer(tx: ParsedTransactionWithMeta): TokenTransferInfo | null {
    if (!tx.meta?.innerInstructions) return null;

    // Look for transfer instructions in inner instructions
    for (const innerIx of tx.meta.innerInstructions) {
      for (const ix of innerIx.instructions) {
        if ('parsed' in ix && ix.parsed?.type === 'transfer') {
          const info = ix.parsed.info;
          if (info.amount) {
            // Need to get the mint from the token account
            // This is a simplified extraction
            return null; // TODO: Implement full token transfer extraction
          }
        }
      }
    }

    // Check main instructions
    const instructions = tx.transaction.message.instructions;
    for (const ix of instructions) {
      if ('parsed' in ix && ix.parsed?.type === 'transferChecked') {
        const info = ix.parsed.info;
        return {
          mint: info.mint,
          amount: parseFloat(info.tokenAmount.uiAmountString),
          decimals: info.tokenAmount.decimals,
          from: info.authority,
          to: info.destination,
        };
      }
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

    // Fallback: calculate from balance changes
    if (tx.meta?.preBalances && tx.meta?.postBalances) {
      const accountKeys = tx.transaction.message.accountKeys;

      for (let i = 0; i < accountKeys.length; i++) {
        const preBal = tx.meta.preBalances[i];
        const postBal = tx.meta.postBalances[i];
        const diff = postBal - preBal;

        // Find sender (negative diff) and receiver (positive diff)
        if (diff > 0 && i !== 0) {
          // i !== 0 excludes fee payer
          const senderIndex = tx.meta.preBalances.findIndex(
            (pre, j) =>
              j !== i &&
              tx.meta!.postBalances[j] - pre < 0 &&
              Math.abs(tx.meta!.postBalances[j] - pre - tx.meta!.fee!) < diff + 1000
          );

          if (senderIndex !== -1) {
            return {
              from: accountKeys[senderIndex].pubkey.toString(),
              to: accountKeys[i].pubkey.toString(),
              amount: diff / LAMPORTS_PER_SOL,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Resolves a token identifier to its symbol
   */
  private resolveTokenSymbol(token: SupportedToken | string): string {
    if (token === 'SOL' || token === 'USDC' || token === 'USDT') {
      return token;
    }

    return this.tokenSymbols.get(token) || token;
  }

  /**
   * Generates a unique receipt ID
   */
  private generateReceiptId(signature: string, timestamp: number): string {
    const data = `${signature}-${timestamp}`;
    // Simple hash for receipt ID
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `RCP-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
  }

  /**
   * Creates a failed receipt
   */
  private createFailedReceipt(signature: string, failures: string[]): PaymentReceipt {
    return {
      verified: false,
      signature,
      from: '',
      to: '',
      amount: 0,
      token: '',
      timestamp: 0,
      slot: 0,
      failures,
      receiptId: this.generateReceiptId(signature, 0),
    };
  }

  /**
   * Checks if a transaction exists and is successful
   */
  async transactionExists(signature: string): Promise<boolean> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      return tx !== null && tx.meta?.err === null;
    } catch {
      return false;
    }
  }

  /**
   * Gets the raw transaction data
   */
  async getTransaction(signature: string): Promise<ParsedTransactionWithMeta | null> {
    return this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
  }
}
