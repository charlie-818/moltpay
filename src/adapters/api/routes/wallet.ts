import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateParams, SolanaAddressSchema } from '../middleware/validation.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import type { ApiResponse, CreateWalletResponse, GetBalanceResponse } from '../types.js';
import { GetBalanceRequestSchema } from '../types.js';
import { WalletManager } from '../../../wallet/WalletManager.js';
import type { WalletInfo } from '../../../types.js';

/**
 * Create wallet routes
 */
export function createWalletRoutes(
  walletManager: WalletManager,
  activeWalletStore: { wallet?: WalletInfo & { salt: string } }
): Router {
  const router = Router();

  /**
   * POST /api/wallet
   * Create a new wallet
   */
  router.post(
    '/',
    asyncHandler(async (_req, res) => {
      const wallet = walletManager.createWallet();
      activeWalletStore.wallet = wallet;

      const response: ApiResponse<CreateWalletResponse> = {
        success: true,
        data: {
          publicKey: wallet.publicKey,
          createdAt: wallet.createdAt,
        },
        timestamp: Date.now(),
      };

      res.status(201).json(response);
    })
  );

  /**
   * GET /api/wallet/:address/balance
   * Get balance for a wallet address
   */
  router.get(
    '/:address/balance',
    validateParams(z.object({ address: SolanaAddressSchema })),
    validateBody(GetBalanceRequestSchema.partial()),
    asyncHandler(async (req, res) => {
      const { address } = req.params;
      const { tokens = [] } = req.body || {};

      const balance = await walletManager.getBalance(address, tokens);

      const response: ApiResponse<GetBalanceResponse> = {
        success: true,
        data: {
          sol: balance.sol,
          tokens: balance.tokens.map((t) => ({
            symbol: t.symbol,
            mint: t.mint,
            amount: t.uiAmount,
          })),
        },
        timestamp: Date.now(),
      };

      res.json(response);
    })
  );

  /**
   * GET /api/wallet/active
   * Get the active wallet's public key
   */
  router.get(
    '/active',
    asyncHandler(async (_req, res) => {
      if (!activeWalletStore.wallet) {
        throw ApiError.notFound('No active wallet. Create a wallet first.');
      }

      const response: ApiResponse<{ publicKey: string }> = {
        success: true,
        data: {
          publicKey: activeWalletStore.wallet.publicKey,
        },
        timestamp: Date.now(),
      };

      res.json(response);
    })
  );

  return router;
}
