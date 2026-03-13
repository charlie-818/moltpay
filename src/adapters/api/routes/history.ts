import { Router } from 'express';
import { z } from 'zod';
import { validateParams, validateQuery, SolanaAddressSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { ApiResponse, GetHistoryResponse } from '../types.js';
import { GetHistoryRequestSchema } from '../types.js';
import { TransactionHistory } from '../../../receipt/TransactionHistory.js';

/**
 * Create history routes
 */
export function createHistoryRoutes(transactionHistory: TransactionHistory): Router {
  const router = Router();

  /**
   * GET /api/history/:address
   * Get transaction history for a wallet
   */
  router.get(
    '/:address',
    validateParams(z.object({ address: SolanaAddressSchema })),
    validateQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).optional().default(10),
        direction: z.enum(['sent', 'received', 'all']).optional().default('all'),
      })
    ),
    asyncHandler(async (req, res) => {
      const { address } = req.params;
      const query = req.query as unknown as { limit: number; direction: 'sent' | 'received' | 'all' };
      const { limit, direction } = query;

      const history = await transactionHistory.getHistory(address, {
        limit,
        direction,
      });

      const response: ApiResponse<GetHistoryResponse> = {
        success: true,
        data: {
          transactions: history.map((tx) => ({
            signature: tx.signature,
            from: tx.from,
            to: tx.to,
            amount: tx.amount,
            token: tx.token,
            timestamp: tx.timestamp,
            status: tx.status,
          })),
        },
        timestamp: Date.now(),
      };

      res.json(response);
    })
  );

  return router;
}
