import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import type { SupportedToken } from '../types.js';
import { TOKEN_MINTS, DEVNET_TOKEN_MINTS } from '../types.js';

export interface TransferParams {
  /** Sender keypair */
  sender: Keypair;
  /** Recipient public key */
  recipient: PublicKey;
  /** Amount to transfer (in token units, e.g., 1.5 SOL) */
  amount: number;
  /** Token to transfer (SOL, USDC, USDT, or mint address) */
  token?: SupportedToken | string;
  /** Optional memo */
  memo?: string;
  /** Use devnet token mints */
  useDevnet?: boolean;
}

export interface BuiltTransaction {
  /** The transaction object */
  transaction: Transaction;
  /** Whether the transaction creates a new token account */
  createsTokenAccount: boolean;
  /** The token mint (if SPL token transfer) */
  tokenMint?: PublicKey;
  /** Amount in smallest units */
  amountRaw: bigint;
}

/**
 * Resolves a token identifier to its mint address
 */
function resolveTokenMint(
  token: SupportedToken | string,
  useDevnet: boolean = false
): PublicKey | null {
  // If it's 'SOL', return null to indicate native transfer
  if (token === 'SOL') {
    return null;
  }

  // Check if it's a supported token symbol
  const mints = useDevnet ? DEVNET_TOKEN_MINTS : TOKEN_MINTS;
  if (token in mints) {
    return new PublicKey(mints[token as SupportedToken]);
  }

  // Assume it's a mint address
  try {
    return new PublicKey(token);
  } catch {
    throw new Error(`Invalid token: ${token}`);
  }
}

/**
 * Builds Solana transactions for SOL and SPL token transfers
 */
export class TransactionBuilder {
  private connection: Connection;
  private useDevnet: boolean;

  constructor(connection: Connection, useDevnet: boolean = true) {
    this.connection = connection;
    this.useDevnet = useDevnet;
  }

  /**
   * Builds a SOL transfer transaction
   */
  async buildSolTransfer(
    sender: Keypair,
    recipient: PublicKey,
    amount: number,
    memo?: string
  ): Promise<BuiltTransaction> {
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

    const transaction = new Transaction();

    // Add compute budget for predictable fees
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
    );

    // Add transfer instruction
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );

    // Add memo if provided
    if (memo) {
      const memoInstruction = this.createMemoInstruction(memo, sender.publicKey);
      transaction.add(memoInstruction);
    }

    // Set fee payer and recent blockhash
    transaction.feePayer = sender.publicKey;
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return {
      transaction,
      createsTokenAccount: false,
      amountRaw: BigInt(lamports),
    };
  }

  /**
   * Builds an SPL token transfer transaction
   */
  async buildTokenTransfer(
    sender: Keypair,
    recipient: PublicKey,
    amount: number,
    tokenMint: PublicKey,
    memo?: string
  ): Promise<BuiltTransaction> {
    // Get token decimals
    const mintInfo = await getMint(this.connection, tokenMint);
    const amountRaw = BigInt(Math.floor(amount * Math.pow(10, mintInfo.decimals)));

    // Get associated token accounts
    const senderAta = await getAssociatedTokenAddress(tokenMint, sender.publicKey);
    const recipientAta = await getAssociatedTokenAddress(tokenMint, recipient);

    const transaction = new Transaction();

    // Add compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })
    );

    // Check if recipient ATA exists, create if needed
    let createsTokenAccount = false;
    try {
      await getAccount(this.connection, recipientAta);
    } catch {
      // Account doesn't exist, add creation instruction
      transaction.add(
        createAssociatedTokenAccountInstruction(
          sender.publicKey, // payer
          recipientAta, // ata
          recipient, // owner
          tokenMint // mint
        )
      );
      createsTokenAccount = true;
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        senderAta,
        recipientAta,
        sender.publicKey,
        amountRaw
      )
    );

    // Add memo if provided
    if (memo) {
      const memoInstruction = this.createMemoInstruction(memo, sender.publicKey);
      transaction.add(memoInstruction);
    }

    // Set fee payer and recent blockhash
    transaction.feePayer = sender.publicKey;
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return {
      transaction,
      createsTokenAccount,
      tokenMint,
      amountRaw,
    };
  }

  /**
   * Builds a transfer transaction (SOL or SPL token)
   */
  async buildTransfer(params: TransferParams): Promise<BuiltTransaction> {
    const { sender, recipient, amount, token = 'SOL', memo, useDevnet } = params;

    const tokenMint = resolveTokenMint(token, useDevnet ?? this.useDevnet);

    if (tokenMint === null) {
      return this.buildSolTransfer(sender, recipient, amount, memo);
    }

    return this.buildTokenTransfer(sender, recipient, amount, tokenMint, memo);
  }

  /**
   * Creates a memo instruction
   */
  private createMemoInstruction(
    memo: string,
    signer: PublicKey
  ): TransactionInstruction {
    const MEMO_PROGRAM_ID = new PublicKey(
      'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
    );

    return new TransactionInstruction({
      keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, 'utf8'),
    });
  }

  /**
   * Estimates transaction fees
   */
  async estimateFee(transaction: Transaction): Promise<number> {
    const message = transaction.compileMessage();
    const feeCalculator = await this.connection.getFeeForMessage(message);
    return feeCalculator.value || 5000; // Default to 5000 lamports
  }

  /**
   * Validates sender has sufficient balance
   */
  async validateBalance(
    sender: PublicKey,
    amount: number,
    tokenMint?: PublicKey
  ): Promise<{ sufficient: boolean; available: number }> {
    if (!tokenMint) {
      // SOL balance
      const balance = await this.connection.getBalance(sender);
      const balanceSol = balance / LAMPORTS_PER_SOL;
      // Account for ~0.001 SOL transaction fee
      const sufficient = balanceSol >= amount + 0.001;
      return { sufficient, available: balanceSol };
    }

    // Token balance
    try {
      const ata = await getAssociatedTokenAddress(tokenMint, sender);
      const account = await getAccount(this.connection, ata);
      const mintInfo = await getMint(this.connection, tokenMint);
      const available = Number(account.amount) / Math.pow(10, mintInfo.decimals);
      const sufficient = available >= amount;
      return { sufficient, available };
    } catch {
      return { sufficient: false, available: 0 };
    }
  }
}
