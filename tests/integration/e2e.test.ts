import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MoltPay, createMoltPay } from '../../src/index';

const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-!!';

// Mock the Solana connection
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getBalance: vi.fn().mockResolvedValue(1000000000), // 1 SOL in lamports
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 100,
      }),
      getSignaturesForAddress: vi.fn().mockResolvedValue([]),
      getTransaction: vi.fn().mockResolvedValue(null),
      requestAirdrop: vi.fn().mockResolvedValue('fake-airdrop-signature'),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
      getTokenAccountBalance: vi.fn().mockResolvedValue({ value: { amount: '0', decimals: 6 } }),
    })),
  };
});

describe('MoltPay SDK E2E', () => {
  let moltpay: MoltPay;

  beforeEach(() => {
    moltpay = new MoltPay({
      encryptionKey: TEST_ENCRYPTION_KEY,
      rpcEndpoint: 'https://api.devnet.solana.com',
    });
  });

  describe('SDK Initialization', () => {
    it('should create MoltPay instance with all modules', () => {
      expect(moltpay).toBeInstanceOf(MoltPay);
      expect(moltpay.wallet).toBeDefined();
      expect(moltpay.transactions).toBeDefined();
      expect(moltpay.sender).toBeDefined();
      expect(moltpay.watcher).toBeDefined();
      expect(moltpay.verifier).toBeDefined();
      expect(moltpay.receipts).toBeDefined();
      expect(moltpay.history).toBeDefined();
      expect(moltpay.rateLimiter).toBeDefined();
      expect(moltpay.fraudDetection).toBeDefined();
    });

    it('should create MoltPay instance with createMoltPay factory', () => {
      const sdk = createMoltPay({
        encryptionKey: TEST_ENCRYPTION_KEY,
      });

      expect(sdk).toBeInstanceOf(MoltPay);
    });
  });

  describe('Wallet Operations', () => {
    it('should create a wallet', () => {
      const wallet = moltpay.wallet.createWallet();

      expect(wallet).toBeDefined();
      expect(wallet.publicKey).toBeDefined();
      expect(wallet.publicKey.length).toBeGreaterThan(30);
      expect(wallet.encryptedPrivateKey).toBeDefined();
      expect(wallet.createdAt).toBeGreaterThan(0);
    });

    it('should create an HD wallet with mnemonic', () => {
      const { wallet, mnemonic } = moltpay.wallet.createHDWallet();

      expect(wallet).toBeDefined();
      expect(wallet.publicKey).toBeDefined();
      expect(mnemonic).toBeDefined();
      expect(mnemonic.split(' ')).toHaveLength(12);
      expect(wallet.derivationPath).toBe("m/44'/501'/0'/0'");
    });

    it('should decrypt a wallet', () => {
      const wallet = moltpay.wallet.createWallet();
      const keypair = moltpay.wallet.decryptWallet(wallet);

      expect(keypair).toBeDefined();
      expect(keypair.publicKey.toBase58()).toBe(wallet.publicKey);
    });

    it('should import from mnemonic', () => {
      const { mnemonic } = moltpay.wallet.createHDWallet();
      const imported = moltpay.wallet.importFromMnemonic(mnemonic, 0);

      expect(imported).toBeDefined();
      expect(imported.publicKey).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should return the connection', () => {
      const connection = moltpay.getConnection();
      expect(connection).toBeDefined();
    });

    it('should return the configuration', () => {
      const config = moltpay.getConfig();
      expect(config).toBeDefined();
      expect(config.encryptionKey).toBe(TEST_ENCRYPTION_KEY);
    });
  });

  describe('Rate Limiter', () => {
    it('should check rate limit', () => {
      const wallet = moltpay.wallet.createWallet();
      const status = moltpay.rateLimiter.check(wallet.publicKey);

      expect(status).toBeDefined();
      expect(status.exceeded).toBe(false);
      expect(status.remaining).toBeGreaterThan(0);
    });

    it('should consume rate limit tokens', () => {
      const wallet = moltpay.wallet.createWallet();

      const before = moltpay.rateLimiter.check(wallet.publicKey);
      moltpay.rateLimiter.consume(wallet.publicKey);
      const after = moltpay.rateLimiter.check(wallet.publicKey);

      expect(after.remaining).toBe(before.remaining - 1);
    });
  });

  describe('Fraud Detection', () => {
    it('should check transaction for fraud', () => {
      const wallet = moltpay.wallet.createWallet();
      const result = moltpay.fraudDetection.check(wallet.publicKey, 1);

      expect(result).toBeDefined();
      expect(result.allowed).toBe(true);
      expect(result.riskScore).toBeDefined();
    });

    it('should flag large transactions', () => {
      const wallet = moltpay.wallet.createWallet();
      const result = moltpay.fraudDetection.check(wallet.publicKey, 10000);

      expect(result.riskScore).toBeGreaterThan(0);
    });
  });

  describe('Receipt Generation', () => {
    it('should generate receipt from transaction result', () => {
      const receipt = moltpay.receipts.fromTransactionResult(
        {
          signature: 'test-signature',
          status: 'confirmed',
          timestamp: Date.now(),
          slot: 12345,
          fee: 5000,
        },
        'sender-pubkey',
        'recipient-pubkey',
        1.5,
        'SOL'
      );

      expect(receipt).toBeDefined();
      expect(receipt.receiptId).toBeDefined();
      expect(receipt.signature).toBe('test-signature');
      expect(receipt.from).toBe('sender-pubkey');
      expect(receipt.to).toBe('recipient-pubkey');
      expect(receipt.amount).toBe(1.5);
      expect(receipt.token).toBe('SOL');
    });
  });
});

describe('Adapter Integration', () => {
  describe('LangChain Tool', () => {
    it('should be importable', async () => {
      const { MoltPayTool, createMoltPayTool } = await import('../../src/adapters/langchain');
      expect(MoltPayTool).toBeDefined();
      expect(createMoltPayTool).toBeDefined();
    });
  });

  describe('OpenClaw Skill', () => {
    it('should be importable', async () => {
      const { MoltPaySkill, createMoltPaySkill } = await import('../../src/adapters/openclaw');
      expect(MoltPaySkill).toBeDefined();
      expect(createMoltPaySkill).toBeDefined();
    });
  });

  describe('CrewAI Tool', () => {
    it('should be importable', async () => {
      const { CrewAITool, createCrewAITool } = await import('../../src/adapters/crewai');
      expect(CrewAITool).toBeDefined();
      expect(createCrewAITool).toBeDefined();
    });
  });

  describe('REST API', () => {
    it('should be importable', async () => {
      const { createApiServer, startApiServer } = await import('../../src/adapters/api');
      expect(createApiServer).toBeDefined();
      expect(startApiServer).toBeDefined();
    });
  });
});
