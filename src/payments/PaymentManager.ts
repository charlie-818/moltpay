import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  sendAndConfirmTransaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  SkillPricing,
  PurchaseParams,
  PurchaseResult,
  SkillError,
} from '../skills/types';

export interface PaymentManagerConfig {
  connection: Connection;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export interface PaymentReceipt {
  signature: string;
  payer: string;
  recipient: string;
  amount: number;
  currency: string;
  timestamp: number;
  slot: number;
  skillId: string;
}

export interface SubscriptionStatus {
  skillId: string;
  active: boolean;
  startDate: number;
  endDate: number;
  nextPaymentDate?: number;
  amount: number;
  currency: string;
}

export class PaymentManager {
  private connection: Connection;
  private commitment: 'processed' | 'confirmed' | 'finalized';

  // Common SPL token mints
  private static readonly TOKEN_MINTS: Record<string, string> = {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    // Devnet
    USDC_DEVNET: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  };

  constructor(config: PaymentManagerConfig) {
    this.connection = config.connection;
    this.commitment = config.commitment || 'confirmed';
  }

  /**
   * Process a skill purchase payment
   */
  async purchaseSkill(
    params: PurchaseParams,
    payerKeypair: Keypair
  ): Promise<PurchaseResult> {
    try {
      const { skillId, amount, currency, recipientWallet } = params;

      let signature: string;

      if (currency === 'SOL') {
        signature = await this.transferSOL(
          payerKeypair,
          new PublicKey(recipientWallet),
          amount
        );
      } else {
        // SPL token transfer
        const tokenMint = this.getTokenMint(currency);
        if (!tokenMint) {
          throw new SkillError(`Unsupported currency: ${currency}`, 'PAYMENT_ERROR');
        }

        signature = await this.transferToken(
          payerKeypair,
          new PublicKey(recipientWallet),
          new PublicKey(tokenMint),
          amount
        );
      }

      return {
        success: true,
        transactionSignature: signature,
        license: {
          id: `license-${Date.now()}`,
          skillId,
          purchaserId: payerKeypair.publicKey.toBase58(),
          type: params.pricingModel === 'subscription' ? 'subscription' :
                params.pricingModel === 'usage' ? 'usage' : 'perpetual',
          issuedAt: Date.now(),
          expiresAt: this.calculateLicenseExpiry(params),
          signature: '', // Would be signed by publisher
          receiptSignature: signature,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Transfer SOL
   */
  async transferSOL(
    from: Keypair,
    to: PublicKey,
    amountSOL: number
  ): Promise<string> {
    const lamports = Math.round(amountSOL * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [from],
      { commitment: this.commitment }
    );

    return signature;
  }

  /**
   * Transfer SPL token
   */
  async transferToken(
    from: Keypair,
    to: PublicKey,
    tokenMint: PublicKey,
    amount: number
  ): Promise<string> {
    // Get token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      from.publicKey
    );

    const toTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      to
    );

    // Get token decimals
    const mintInfo = await this.connection.getParsedAccountInfo(tokenMint);
    const decimals = (mintInfo.value?.data as { parsed: { info: { decimals: number } } })
      ?.parsed?.info?.decimals || 6;

    const amountInSmallestUnit = BigInt(Math.round(amount * Math.pow(10, decimals)));

    const transaction = new Transaction().add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        from.publicKey,
        amountInSmallestUnit
      )
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [from],
      { commitment: this.commitment }
    );

    return signature;
  }

  /**
   * Verify a payment was made
   */
  async verifyPayment(
    signature: string,
    expectedRecipient: string,
    expectedAmount: number,
    currency: string = 'SOL'
  ): Promise<{ verified: boolean; receipt?: PaymentReceipt; error?: string }> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        commitment: this.commitment === 'processed' ? 'confirmed' : this.commitment,
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return { verified: false, error: 'Transaction not found' };
      }

      if (tx.meta?.err) {
        return { verified: false, error: 'Transaction failed' };
      }

      // For SOL transfers
      if (currency === 'SOL') {
        const preBalances = tx.meta?.preBalances || [];
        const postBalances = tx.meta?.postBalances || [];
        const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys;

        const recipientIndex = accountKeys.findIndex(
          key => key.toBase58() === expectedRecipient
        );

        if (recipientIndex === -1) {
          return { verified: false, error: 'Recipient not found in transaction' };
        }

        const received = (postBalances[recipientIndex] - preBalances[recipientIndex]) / LAMPORTS_PER_SOL;

        if (received < expectedAmount * 0.99) { // 1% tolerance for fees
          return {
            verified: false,
            error: `Insufficient amount: expected ${expectedAmount}, got ${received}`,
          };
        }

        return {
          verified: true,
          receipt: {
            signature,
            payer: accountKeys[0].toBase58(),
            recipient: expectedRecipient,
            amount: received,
            currency: 'SOL',
            timestamp: (tx.blockTime || Date.now() / 1000) * 1000,
            slot: tx.slot,
            skillId: '', // Would need to be provided separately
          },
        };
      }

      // For SPL token transfers, would need to parse token transfer instructions
      return { verified: false, error: 'Token payment verification not implemented' };
    } catch (error) {
      return {
        verified: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get SOL balance
   */
  async getSOLBalance(wallet: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(wallet);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Get SPL token balance
   */
  async getTokenBalance(wallet: PublicKey, tokenMint: PublicKey): Promise<number> {
    try {
      const tokenAccount = await getAssociatedTokenAddress(tokenMint, wallet);
      const account = await getAccount(this.connection, tokenAccount);

      // Get decimals
      const mintInfo = await this.connection.getParsedAccountInfo(tokenMint);
      const decimals = (mintInfo.value?.data as { parsed: { info: { decimals: number } } })
        ?.parsed?.info?.decimals || 6;

      return Number(account.amount) / Math.pow(10, decimals);
    } catch {
      return 0;
    }
  }

  /**
   * Estimate transaction fee
   */
  async estimateFee(transaction: Transaction): Promise<number> {
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    const message = transaction.compileMessage();
    const fee = await this.connection.getFeeForMessage(message);

    return (fee.value || 5000) / LAMPORTS_PER_SOL;
  }

  /**
   * Check if wallet has sufficient funds
   */
  async hasSufficientFunds(
    wallet: PublicKey,
    amount: number,
    currency: string = 'SOL'
  ): Promise<boolean> {
    if (currency === 'SOL') {
      const balance = await this.getSOLBalance(wallet);
      // Account for transaction fee (~0.000005 SOL)
      return balance >= amount + 0.00001;
    }

    const tokenMint = this.getTokenMint(currency);
    if (!tokenMint) return false;

    const balance = await this.getTokenBalance(wallet, new PublicKey(tokenMint));
    return balance >= amount;
  }

  /**
   * Calculate price in SOL based on pricing model
   */
  calculatePrice(pricing: SkillPricing): number {
    if (pricing.model === 'free') return 0;
    return pricing.amount || 0;
  }

  /**
   * Get token mint address
   */
  private getTokenMint(currency: string): string | undefined {
    return PaymentManager.TOKEN_MINTS[currency.toUpperCase()];
  }

  /**
   * Calculate license expiry based on pricing model
   */
  private calculateLicenseExpiry(params: PurchaseParams): number | undefined {
    if (params.pricingModel === 'one-time') {
      return undefined; // Perpetual
    }

    if (params.pricingModel === 'subscription') {
      const now = Date.now();
      // Default to monthly if not specified
      return now + 30 * 24 * 60 * 60 * 1000;
    }

    return undefined;
  }

  /**
   * Create an escrow transaction (for dispute protection)
   */
  async createEscrowTransaction(
    payer: Keypair,
    recipient: PublicKey,
    escrowAuthority: PublicKey,
    amount: number,
    currency: string = 'SOL'
  ): Promise<{ transaction: Transaction; escrowAccount: PublicKey }> {
    // Create a PDA for the escrow
    const [escrowPda] = await PublicKey.findProgramAddress(
      [
        Buffer.from('escrow'),
        payer.publicKey.toBuffer(),
        recipient.toBuffer(),
        Buffer.from(Date.now().toString()),
      ],
      SystemProgram.programId // Would be custom escrow program in production
    );

    const lamports = Math.round(amount * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: escrowPda,
        lamports,
      })
    );

    return {
      transaction,
      escrowAccount: escrowPda,
    };
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies(): string[] {
    return ['SOL', ...Object.keys(PaymentManager.TOKEN_MINTS)];
  }
}
