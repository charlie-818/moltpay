import type { RateLimitConfig, RateLimitStatus } from '../types.js';

interface RateLimitEntry {
  timestamps: number[];
  windowStart: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTransactions: 10,
  windowMs: 60000, // 1 minute
};

/**
 * Rate limiter for controlling transaction frequency per wallet
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private limits: Map<string, RateLimitEntry>;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.limits = new Map();
  }

  /**
   * Cleans up expired entries from the rate limit map
   */
  private cleanup(walletId: string): void {
    const entry = this.limits.get(walletId);
    if (!entry) return;

    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Remove timestamps outside the current window
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
    entry.windowStart = windowStart;

    if (entry.timestamps.length === 0) {
      this.limits.delete(walletId);
    }
  }

  /**
   * Checks if a wallet can perform a transaction
   *
   * @param walletId - Wallet public key or identifier
   * @returns Rate limit status
   */
  check(walletId: string): RateLimitStatus {
    this.cleanup(walletId);

    const entry = this.limits.get(walletId);
    const now = Date.now();
    const count = entry?.timestamps.length ?? 0;
    const remaining = Math.max(0, this.config.maxTransactions - count);
    const exceeded = remaining === 0;

    // Calculate reset time
    let resetAt = now + this.config.windowMs;
    if (entry && entry.timestamps.length > 0) {
      // Reset when the oldest timestamp in window expires
      resetAt = entry.timestamps[0] + this.config.windowMs;
    }

    return {
      remaining,
      resetAt,
      exceeded,
    };
  }

  /**
   * Records a transaction for rate limiting
   *
   * @param walletId - Wallet public key or identifier
   * @returns Whether the transaction is allowed
   */
  consume(walletId: string): boolean {
    const status = this.check(walletId);

    if (status.exceeded) {
      return false;
    }

    const now = Date.now();
    let entry = this.limits.get(walletId);

    if (!entry) {
      entry = {
        timestamps: [],
        windowStart: now - this.config.windowMs,
      };
      this.limits.set(walletId, entry);
    }

    entry.timestamps.push(now);
    return true;
  }

  /**
   * Resets rate limit for a wallet
   *
   * @param walletId - Wallet public key or identifier
   */
  reset(walletId: string): void {
    this.limits.delete(walletId);
  }

  /**
   * Resets all rate limits
   */
  resetAll(): void {
    this.limits.clear();
  }

  /**
   * Updates rate limit configuration
   *
   * @param config - New configuration
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }
}

// Default singleton instance
let defaultLimiter: RateLimiter | null = null;

/**
 * Gets or creates the default rate limiter instance
 */
export function getDefaultRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  if (!defaultLimiter) {
    defaultLimiter = new RateLimiter(config);
  } else if (config) {
    defaultLimiter.updateConfig(config);
  }
  return defaultLimiter;
}
