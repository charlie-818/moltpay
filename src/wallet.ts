import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

export class MoltWallet {
  private keypair: Keypair;
  private connection: Connection;

  constructor(connection: Connection, keypair?: Keypair) {
    this.connection = connection;
    this.keypair = keypair ?? Keypair.generate();
  }

  static fromSecretKey(connection: Connection, secretKey: Uint8Array): MoltWallet {
    return new MoltWallet(connection, Keypair.fromSecretKey(secretKey));
  }

  static fromBase58(connection: Connection, base58Key: string): MoltWallet {
    const secretKey = bs58.decode(base58Key);
    return MoltWallet.fromSecretKey(connection, secretKey);
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  get address(): string {
    return this.keypair.publicKey.toBase58();
  }

  async getBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  async transfer(to: PublicKey | string, amountSol: number): Promise<string> {
    const recipient = typeof to === 'string' ? new PublicKey(to) : to;
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.keypair.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.keypair]
    );

    return signature;
  }

  exportSecretKey(): string {
    return bs58.encode(this.keypair.secretKey);
  }
}
