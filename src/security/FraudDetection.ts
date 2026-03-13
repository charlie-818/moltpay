import type { FraudDetectionConfig, FraudCheckResult } from '../types.js';

interface TransactionRecord {
  amount: number;
  timestamp: number;
  signature: string;
}

interface WalletHistory {
  transactions: TransactionRecord[];
  dailyVolume: number;
  dayStart: number;
}

const DEFAULT_CONFIG: FraudDetectionConfig = {
  maxTransactionAmount: 100, // 100 SOL
  maxDailyVolume: 1000, // 1000 SOL
  minTransactionInterval: 1000, // 1 second
  anomalyDetection: true,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fraud detection system for monitoring suspicious transaction patterns
 */
export class FraudDetection {
  private config: FraudDetectionConfig;
  private walletHistory: Map<string, WalletHistory>;
  private processedSignatures: Set<string>;

  constructor(config: Partial<FraudDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.walletHistory = new Map();
    this.processedSignatures = new Set();
  }

  /**
   * Gets or creates wallet history, cleaning up old data
   */
  private getWalletHistory(walletId: string): WalletHistory {
    const now = Date.now();
    const dayStart = now - (now % ONE_DAY_MS);

    let history = this.walletHistory.get(walletId);

    if (!history) {
      history = {
        transactions: [],
        dailyVolume: 0,
        dayStart,
      };
      this.walletHistory.set(walletId, history);
    }

    // Reset daily volume if new day
    if (history.dayStart < dayStart) {
      history.dailyVolume = 0;
      history.dayStart = dayStart;
      // Keep only transactions from last 24 hours for anomaly detection
      history.transactions = history.transactions.filter(
        tx => tx.timestamp > now - ONE_DAY_MS
      );
    }

    return history;
  }

  /**
   * Calculates standard deviation for anomaly detection
   */
  private calculateStats(amounts: number[]): { mean: number; stdDev: number } {
    if (amounts.length === 0) {
      return { mean: 0, stdDev: 0 };
    }

    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const squaredDiffs = amounts.map(a => Math.pow(a - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
  }

  /**
   * Checks a transaction for fraud indicators
   *
   * @param walletId - Wallet public key
   * @param amount - Transaction amount in SOL
   * @param signature - Transaction signature (for duplicate detection)
   * @returns Fraud check result
   */
  check(walletId: string, amount: number, signature?: string): FraudCheckResult {
    const flags: string[] = [];
    let riskScore = 0;

    // Check for duplicate transaction
    if (signature && this.processedSignatures.has(signature)) {
      return {
        allowed: false,
        riskScore: 100,
        flags: ['Duplicate transaction detected'],
      };
    }

    const history = this.getWalletHistory(walletId);
    const now = Date.now();

    // Check max transaction amount
    if (amount > this.config.maxTransactionAmount) {
      flags.push(`Transaction amount ${amount} exceeds limit ${this.config.maxTransactionAmount}`);
      riskScore += 40;
    }

    // Check daily volume
    if (history.dailyVolume + amount > this.config.maxDailyVolume) {
      flags.push(`Daily volume would exceed limit ${this.config.maxDailyVolume}`);
      riskScore += 30;
    }

    // Check transaction interval
    if (history.transactions.length > 0) {
      const lastTx = history.transactions[history.transactions.length - 1];
      const interval = now - lastTx.timestamp;

      if (interval < this.config.minTransactionInterval) {
        flags.push(`Transaction too fast (${interval}ms < ${this.config.minTransactionInterval}ms minimum)`);
        riskScore += 20;
      }
    }

    // Anomaly detection (3 sigma rule)
    if (this.config.anomalyDetection && history.transactions.length >= 5) {
      const amounts = history.transactions.map(tx => tx.amount);
      const { mean, stdDev } = this.calculateStats(amounts);

      if (stdDev > 0) {
        const zScore = Math.abs(amount - mean) / stdDev;

        if (zScore > 3) {
          flags.push(`Unusual amount: ${zScore.toFixed(2)} standard deviations from mean`);
          riskScore += Math.min(30, Math.floor(zScore * 5));
        }
      }
    }

    // Cap risk score at 100
    riskScore = Math.min(100, riskScore);

    // Transaction is blocked if risk score >= 70
    const allowed = riskScore < 70;

    return {
      allowed,
      riskScore,
      flags,
    };
  }

  /**
   * Records a completed transaction
   *
   * @param walletId - Wallet public key
   * @param amount - Transaction amount in SOL
   * @param signature - Transaction signature
   */
  record(walletId: string, amount: number, signature: string): void {
    const history = this.getWalletHistory(walletId);
    const now = Date.now();

    history.transactions.push({
      amount,
      timestamp: now,
      signature,
    });

    history.dailyVolume += amount;
    this.processedSignatures.add(signature);

    // Limit signature cache size (keep last 10000)
    if (this.processedSignatures.size > 10000) {
      const iterator = this.processedSignatures.values();
      for (let i = 0; i < 1000; i++) {
        const sig = iterator.next().value;
        if (sig) this.processedSignatures.delete(sig);
      }
    }
  }

  /**
   * Checks if a signature has been processed
   *
   * @param signature - Transaction signature
   * @returns Whether the signature is a duplicate
   */
  isDuplicate(signature: string): boolean {
    return this.processedSignatures.has(signature);
  }

  /**
   * Resets fraud detection state for a wallet
   *
   * @param walletId - Wallet public key
   */
  reset(walletId: string): void {
    this.walletHistory.delete(walletId);
  }

  /**
   * Resets all fraud detection state
   */
  resetAll(): void {
    this.walletHistory.clear();
    this.processedSignatures.clear();
  }

  /**
   * Updates configuration
   *
   * @param config - New configuration
   */
  updateConfig(config: Partial<FraudDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets current configuration
   */
  getConfig(): FraudDetectionConfig {
    return { ...this.config };
  }

  /**
   * Gets transaction history for a wallet
   *
   * @param walletId - Wallet public key
   * @returns Transaction records
   */
  getHistory(walletId: string): TransactionRecord[] {
    const history = this.walletHistory.get(walletId);
    return history ? [...history.transactions] : [];
  }
}

// Default singleton instance
let defaultDetector: FraudDetection | null = null;

/**
 * Gets or creates the default fraud detection instance
 */
export function getDefaultFraudDetection(config?: Partial<FraudDetectionConfig>): FraudDetection {
  if (!defaultDetector) {
    defaultDetector = new FraudDetection(config);
  } else if (config) {
    defaultDetector.updateConfig(config);
  }
  return defaultDetector;
}
