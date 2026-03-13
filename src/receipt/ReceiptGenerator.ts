import type { PaymentReceipt, TransactionResult } from '../types.js';

/**
 * Generates and formats payment receipts
 */
export class ReceiptGenerator {
  /**
   * Creates a receipt from a transaction result
   */
  static fromTransactionResult(
    result: TransactionResult,
    from: string,
    to: string,
    amount: number,
    token: string
  ): PaymentReceipt {
    const receiptId = ReceiptGenerator.generateReceiptId(
      result.signature,
      result.timestamp || Date.now() / 1000
    );

    return {
      verified: result.status !== 'failed',
      signature: result.signature,
      from,
      to,
      amount,
      token,
      timestamp: result.timestamp || Math.floor(Date.now() / 1000),
      slot: result.slot || 0,
      failures: result.error ? [result.error] : undefined,
      receiptId,
    };
  }

  /**
   * Generates a unique receipt ID
   */
  static generateReceiptId(signature: string, timestamp: number): string {
    const data = `${signature}-${timestamp}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `RCP-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
  }

  /**
   * Formats a receipt as a human-readable string
   */
  static formatReceipt(receipt: PaymentReceipt): string {
    const lines: string[] = [
      '╔════════════════════════════════════════════════════════════╗',
      '║                     PAYMENT RECEIPT                        ║',
      '╠════════════════════════════════════════════════════════════╣',
      `║ Receipt ID: ${receipt.receiptId.padEnd(46)}║`,
      `║ Status: ${receipt.verified ? '✓ VERIFIED' : '✗ FAILED'.padEnd(50)}║`,
      '╠════════════════════════════════════════════════════════════╣',
      `║ Amount: ${receipt.amount} ${receipt.token}`.padEnd(61) + '║',
      `║ From: ${receipt.from.slice(0, 44)}...`.padEnd(61) + '║',
      `║ To: ${receipt.to.slice(0, 46)}...`.padEnd(61) + '║',
      '╠════════════════════════════════════════════════════════════╣',
      `║ Signature: ${receipt.signature.slice(0, 44)}...`.padEnd(61) + '║',
      `║ Timestamp: ${new Date(receipt.timestamp * 1000).toISOString()}`.padEnd(61) + '║',
      `║ Slot: ${receipt.slot}`.padEnd(61) + '║',
    ];

    if (receipt.failures && receipt.failures.length > 0) {
      lines.push('╠════════════════════════════════════════════════════════════╣');
      lines.push('║ Failures:'.padEnd(61) + '║');
      for (const failure of receipt.failures) {
        const truncated = failure.length > 55 ? failure.slice(0, 52) + '...' : failure;
        lines.push(`║   - ${truncated}`.padEnd(61) + '║');
      }
    }

    lines.push('╚════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  /**
   * Formats a receipt as JSON
   */
  static toJSON(receipt: PaymentReceipt): string {
    return JSON.stringify(receipt, null, 2);
  }

  /**
   * Formats a receipt as a compact string for logging
   */
  static toCompactString(receipt: PaymentReceipt): string {
    const status = receipt.verified ? '✓' : '✗';
    return `[${status}] ${receipt.receiptId}: ${receipt.amount} ${receipt.token} ${receipt.from.slice(0, 8)}...→${receipt.to.slice(0, 8)}...`;
  }

  /**
   * Creates a proof-of-payment object that can be shared
   */
  static createProofOfPayment(receipt: PaymentReceipt): {
    receiptId: string;
    signature: string;
    amount: number;
    token: string;
    recipient: string;
    timestamp: number;
    verified: boolean;
  } {
    return {
      receiptId: receipt.receiptId,
      signature: receipt.signature,
      amount: receipt.amount,
      token: receipt.token,
      recipient: receipt.to,
      timestamp: receipt.timestamp,
      verified: receipt.verified,
    };
  }

  /**
   * Validates a receipt structure
   */
  static isValidReceipt(receipt: unknown): receipt is PaymentReceipt {
    if (typeof receipt !== 'object' || receipt === null) {
      return false;
    }

    const r = receipt as Record<string, unknown>;

    return (
      typeof r.verified === 'boolean' &&
      typeof r.signature === 'string' &&
      typeof r.from === 'string' &&
      typeof r.to === 'string' &&
      typeof r.amount === 'number' &&
      typeof r.token === 'string' &&
      typeof r.timestamp === 'number' &&
      typeof r.slot === 'number' &&
      typeof r.receiptId === 'string'
    );
  }
}
