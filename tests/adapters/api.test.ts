import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { createApiServer } from '../../src/adapters/api';

const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-!!';
const TEST_API_KEY = 'test-api-key-12345';

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
    })),
  };
});

describe('API Server', () => {
  let app: Application;

  beforeAll(() => {
    app = createApiServer({
      encryptionKey: TEST_ENCRYPTION_KEY,
      network: 'devnet',
      apiKey: TEST_API_KEY,
    });
  });

  describe('Health Check', () => {
    it('GET /health should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.network).toBe('devnet');
    });
  });

  describe('API Info', () => {
    it('GET /api should return API info', async () => {
      const response = await request(app)
        .get('/api')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('MoltPay API');
      expect(response.body.data.endpoints).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('should reject requests without Authorization header', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authorization');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer wrong-key');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should reject requests with invalid auth format', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', 'Basic invalid-format');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Wallet Routes', () => {
    describe('POST /api/wallet', () => {
      it('should create a new wallet', async () => {
        const response = await request(app)
          .post('/api/wallet')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({});

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.publicKey).toBeDefined();
        expect(response.body.data.publicKey.length).toBeGreaterThan(30);
        expect(response.body.data.createdAt).toBeDefined();
      });
    });

    describe('GET /api/wallet/:address/balance', () => {
      it('should get wallet balance', async () => {
        // First create a wallet
        const createResponse = await request(app)
          .post('/api/wallet')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({});

        const publicKey = createResponse.body.data.publicKey;

        const response = await request(app)
          .get(`/api/wallet/${publicKey}/balance`)
          .set('Authorization', `Bearer ${TEST_API_KEY}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(typeof response.body.data.sol).toBe('number');
        expect(Array.isArray(response.body.data.tokens)).toBe(true);
      });

      it('should reject invalid address', async () => {
        const response = await request(app)
          .get('/api/wallet/invalid-address/balance')
          .set('Authorization', `Bearer ${TEST_API_KEY}`);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/wallet/active', () => {
      it('should return 404 if no active wallet', async () => {
        // Create a fresh server instance with no active wallet
        const freshApp = createApiServer({
          encryptionKey: TEST_ENCRYPTION_KEY,
          network: 'devnet',
          apiKey: TEST_API_KEY,
        });

        const response = await request(freshApp)
          .get('/api/wallet/active')
          .set('Authorization', `Bearer ${TEST_API_KEY}`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });

      it('should return active wallet after creation', async () => {
        // Create a wallet first
        await request(app)
          .post('/api/wallet')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({});

        const response = await request(app)
          .get('/api/wallet/active')
          .set('Authorization', `Bearer ${TEST_API_KEY}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.publicKey).toBeDefined();
      });
    });
  });

  describe('Transaction Routes', () => {
    describe('POST /api/transaction/send', () => {
      it('should reject if no active wallet', async () => {
        const freshApp = createApiServer({
          encryptionKey: TEST_ENCRYPTION_KEY,
          network: 'devnet',
          apiKey: TEST_API_KEY,
        });

        const response = await request(freshApp)
          .post('/api/transaction/send')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            to: 'FakeRecipientAddress123456789012345678901234',
            amount: 0.1,
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('No active wallet');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/transaction/send')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should validate amount is positive', async () => {
        const response = await request(app)
          .post('/api/transaction/send')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            to: 'FakeRecipientAddress123456789012345678901234',
            amount: -1,
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/transaction/verify', () => {
      it('should validate signature format', async () => {
        const response = await request(app)
          .post('/api/transaction/verify')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            signature: 'invalid',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Airdrop Routes', () => {
    describe('POST /api/airdrop', () => {
      it('should validate publicKey', async () => {
        const response = await request(app)
          .post('/api/transaction/airdrop')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            publicKey: 'invalid',
            amount: 1,
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should validate amount is positive', async () => {
        const response = await request(app)
          .post('/api/transaction/airdrop')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            publicKey: 'FakeAddress12345678901234567890123456789012',
            amount: -1,
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('History Routes', () => {
    describe('GET /api/history/:address', () => {
      it('should get transaction history', async () => {
        // Create a wallet first
        const createResponse = await request(app)
          .post('/api/wallet')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({});

        const publicKey = createResponse.body.data.publicKey;

        const response = await request(app)
          .get(`/api/history/${publicKey}`)
          .set('Authorization', `Bearer ${TEST_API_KEY}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data.transactions)).toBe(true);
      });

      it('should validate query parameters', async () => {
        const createResponse = await request(app)
          .post('/api/wallet')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({});

        const publicKey = createResponse.body.data.publicKey;

        const response = await request(app)
          .get(`/api/history/${publicKey}?limit=10&direction=all`)
          .set('Authorization', `Bearer ${TEST_API_KEY}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should reject invalid direction', async () => {
        const createResponse = await request(app)
          .post('/api/wallet')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({});

        const publicKey = createResponse.body.data.publicKey;

        const response = await request(app)
          .get(`/api/history/${publicKey}?direction=invalid`)
          .set('Authorization', `Bearer ${TEST_API_KEY}`);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown/route')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });
});

describe('API Server without auth', () => {
  it('should allow requests without API key when not configured', async () => {
    const appNoAuth = createApiServer({
      encryptionKey: TEST_ENCRYPTION_KEY,
      network: 'devnet',
      // No apiKey configured
    });

    const response = await request(appNoAuth).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
