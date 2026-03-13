import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import type { ApiConfig } from './types.js';
import type { WalletInfo } from '../../types.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createWalletRoutes, createTransactionRoutes, createHistoryRoutes } from './routes/index.js';
import { WalletManager } from '../../wallet/WalletManager.js';
import { TransactionBuilder } from '../../transaction/TransactionBuilder.js';
import { TransactionSender } from '../../transaction/TransactionSender.js';
import { PaymentVerifier } from '../../receipt/PaymentVerifier.js';
import { TransactionHistory } from '../../receipt/TransactionHistory.js';
import { RateLimiter } from '../../security/RateLimiter.js';
import { FraudDetection } from '../../security/FraudDetection.js';

/**
 * MoltPay REST API Server
 *
 * Provides a RESTful interface for Solana payment operations.
 * Can be used as a standalone server or mounted in an existing Express app.
 *
 * @example Standalone server
 * ```typescript
 * import { createApiServer, startApiServer } from 'moltpay/api';
 *
 * const app = createApiServer({
 *   encryptionKey: process.env.MOLTPAY_KEY,
 *   network: 'devnet',
 *   apiKey: process.env.API_KEY
 * });
 *
 * startApiServer(app, 3000);
 * ```
 *
 * @example Mount in existing app
 * ```typescript
 * import express from 'express';
 * import { createApiServer } from 'moltpay/api';
 *
 * const app = express();
 * const moltpayApi = createApiServer({ encryptionKey: '...' });
 *
 * app.use('/payments', moltpayApi);
 * ```
 */
export function createApiServer(config: ApiConfig): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigins || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Body parsing
  app.use(express.json());

  // API key authentication
  app.use(createAuthMiddleware(config.apiKey));

  // Initialize Solana connection and services
  const rpcEndpoint = config.rpcEndpoint || clusterApiUrl(config.network || 'devnet');
  const connection = new Connection(rpcEndpoint, 'confirmed');
  const network = config.network || 'devnet';
  const isDevnet = network !== 'mainnet-beta';

  const walletManager = new WalletManager({
    encryptionKey: config.encryptionKey,
    rpcEndpoint,
  });

  const transactionBuilder = new TransactionBuilder(connection, isDevnet);
  const transactionSender = new TransactionSender(connection);
  const paymentVerifier = new PaymentVerifier(connection, isDevnet);
  const transactionHistory = new TransactionHistory(connection);
  const rateLimiter = new RateLimiter({ maxTransactions: 10, windowMs: 60000 });
  const fraudDetection = new FraudDetection();

  // Active wallet store (shared across routes)
  const activeWalletStore: { wallet?: WalletInfo & { salt: string } } = {};

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        network,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });
  });

  // API info endpoint
  app.get('/api', (_req, res) => {
    res.json({
      success: true,
      data: {
        name: 'MoltPay API',
        version: '1.0.0',
        network,
        endpoints: {
          wallet: {
            'POST /api/wallet': 'Create a new wallet',
            'GET /api/wallet/:address/balance': 'Get wallet balance',
            'GET /api/wallet/active': 'Get active wallet',
          },
          transaction: {
            'POST /api/transaction/send': 'Send SOL or tokens',
            'POST /api/transaction/verify': 'Verify a payment',
            'POST /api/airdrop': 'Request airdrop (devnet)',
          },
          history: {
            'GET /api/history/:address': 'Get transaction history',
          },
        },
      },
      timestamp: Date.now(),
    });
  });

  // Mount routes
  app.use('/api/wallet', createWalletRoutes(walletManager, activeWalletStore));
  app.use(
    '/api/transaction',
    createTransactionRoutes({
      walletManager,
      transactionBuilder,
      transactionSender,
      paymentVerifier,
      rateLimiter,
      fraudDetection,
      encryptionKey: config.encryptionKey,
      network,
      activeWalletStore,
    })
  );
  app.use('/api/history', createHistoryRoutes(transactionHistory));

  // Airdrop at root level for convenience
  app.use('/api/airdrop', (req, res, next) => {
    if (req.method === 'POST') {
      // Forward to transaction router's airdrop handler
      req.url = '/airdrop';
      createTransactionRoutes({
        walletManager,
        transactionBuilder,
        transactionSender,
        paymentVerifier,
        rateLimiter,
        fraudDetection,
        encryptionKey: config.encryptionKey,
        network,
        activeWalletStore,
      })(req, res, next);
    } else {
      next();
    }
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Starts the API server on the specified port
 */
export function startApiServer(app: Application, port: number = 3000): void {
  app.listen(port, () => {
    console.log(`MoltPay API server running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`API info: http://localhost:${port}/api`);
  });
}

/**
 * Creates and starts an API server from environment configuration
 */
export function createAndStartApiServer(config?: Partial<ApiConfig>): Application {
  const fullConfig: ApiConfig = {
    encryptionKey: config?.encryptionKey || process.env.MOLTPAY_ENCRYPTION_KEY || '',
    rpcEndpoint: config?.rpcEndpoint || process.env.MOLTPAY_RPC_ENDPOINT,
    network: (config?.network || process.env.MOLTPAY_NETWORK || 'devnet') as
      | 'devnet'
      | 'mainnet-beta',
    port: config?.port || parseInt(process.env.MOLTPAY_API_PORT || '3000', 10),
    apiKey: config?.apiKey || process.env.MOLTPAY_API_KEY,
    corsOrigins: config?.corsOrigins,
  };

  if (!fullConfig.encryptionKey) {
    throw new Error('MOLTPAY_ENCRYPTION_KEY environment variable or encryptionKey config required');
  }

  const app = createApiServer(fullConfig);
  startApiServer(app, fullConfig.port);

  return app;
}
