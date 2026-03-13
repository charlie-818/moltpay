import { Router } from 'express';
import { PublicKey } from '@solana/web3.js';
import { validateBody } from '../middleware/validation.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import type {
  ApiResponse,
  SendPaymentResponse,
  VerifyPaymentResponse,
  RequestAirdropResponse,
} from '../types.js';
import {
  SendPaymentRequestSchema,
  VerifyPaymentRequestSchema,
  RequestAirdropSchema,
} from '../types.js';
import type { WalletInfo, SupportedToken } from '../../../types.js';
import { TransactionBuilder } from '../../../transaction/TransactionBuilder.js';
import { TransactionSender } from '../../../transaction/TransactionSender.js';
import { PaymentVerifier } from '../../../receipt/PaymentVerifier.js';
import { ReceiptGenerator } from '../../../receipt/ReceiptGenerator.js';
import { RateLimiter } from '../../../security/RateLimiter.js';
import { FraudDetection } from '../../../security/FraudDetection.js';
import { WalletManager } from '../../../wallet/WalletManager.js';
import { decryptKeypair } from '../../../wallet/KeyStore.js';

interface TransactionRoutesConfig {
  walletManager: WalletManager;
  transactionBuilder: TransactionBuilder;
  transactionSender: TransactionSender;
  paymentVerifier: PaymentVerifier;
  rateLimiter: RateLimiter;
  fraudDetection: FraudDetection;
  encryptionKey: string;
  network: 'devnet' | 'mainnet-beta';
  activeWalletStore: { wallet?: WalletInfo & { salt: string } };
}

/**
 * Create transaction routes
 */
export function createTransactionRoutes(config: TransactionRoutesConfig): Router {
  const router = Router();
  const {
    walletManager,
    transactionBuilder,
    transactionSender,
    paymentVerifier,
    rateLimiter,
    fraudDetection,
    encryptionKey,
    network,
    activeWalletStore,
  } = config;

  /**
   * POST /api/transaction/send
   * Send SOL or SPL tokens
   */
  router.post(
    '/send',
    validateBody(SendPaymentRequestSchema),
    asyncHandler(async (req, res) => {
      const { to, amount, token = 'SOL', memo } = req.body;

      if (!activeWalletStore.wallet) {
        throw ApiError.badRequest('No active wallet. Create a wallet first.');
      }

      const wallet = activeWalletStore.wallet;

      // Check rate limit
      const rateStatus = rateLimiter.check(wallet.publicKey);
      if (rateStatus.exceeded) {
        throw ApiError.rateLimited(
          `Rate limited. Try again at ${new Date(rateStatus.resetAt).toISOString()}`
        );
      }

      // Check fraud detection
      const fraudCheck = fraudDetection.check(wallet.publicKey, amount);
      if (!fraudCheck.allowed) {
        throw ApiError.badRequest(`Transaction blocked: ${fraudCheck.flags.join(', ')}`);
      }

      // Decrypt keypair
      const keypair = decryptKeypair(wallet, encryptionKey);

      // Build transaction
      const built = await transactionBuilder.buildTransfer({
        sender: keypair,
        recipient: new PublicKey(to),
        amount,
        token: token as SupportedToken,
        memo,
      });

      // Send and confirm
      const result = await transactionSender.signSendAndConfirm(built.transaction, [keypair]);

      // Record for rate limiting and fraud detection
      rateLimiter.consume(wallet.publicKey);
      if (result.status !== 'failed') {
        fraudDetection.record(wallet.publicKey, amount, result.signature);
      }

      if (result.status === 'failed') {
        throw ApiError.badRequest(result.error || 'Transaction failed');
      }

      // Generate receipt
      const receipt = ReceiptGenerator.fromTransactionResult(
        result,
        wallet.publicKey,
        to,
        amount,
        token
      );

      const response: ApiResponse<SendPaymentResponse> = {
        success: true,
        data: {
          signature: result.signature,
          status: result.status,
          receiptId: receipt.receiptId,
        },
        timestamp: Date.now(),
      };

      res.status(201).json(response);
    })
  );

  /**
   * POST /api/transaction/verify
   * Verify a payment transaction
   */
  router.post(
    '/verify',
    validateBody(VerifyPaymentRequestSchema),
    asyncHandler(async (req, res) => {
      const { signature, expectedRecipient, expectedAmount, expectedToken } = req.body;

      const receipt = await paymentVerifier.verifyPayment({
        signature,
        expectedRecipient,
        expectedAmount,
        expectedToken,
      });

      const response: ApiResponse<VerifyPaymentResponse> = {
        success: true,
        data: {
          verified: receipt.verified,
          receipt: receipt.verified
            ? {
                receiptId: receipt.receiptId,
                from: receipt.from,
                to: receipt.to,
                amount: receipt.amount,
                token: receipt.token,
                timestamp: receipt.timestamp,
              }
            : undefined,
          failures: receipt.failures,
        },
        timestamp: Date.now(),
      };

      res.json(response);
    })
  );

  /**
   * POST /api/airdrop
   * Request SOL airdrop (devnet only)
   */
  router.post(
    '/airdrop',
    validateBody(RequestAirdropSchema),
    asyncHandler(async (req, res) => {
      const { publicKey, amount = 1 } = req.body;

      if (network === 'mainnet-beta') {
        throw ApiError.badRequest('Airdrop not available on mainnet');
      }

      const signature = await walletManager.requestAirdrop(publicKey, amount);

      const response: ApiResponse<RequestAirdropResponse> = {
        success: true,
        data: {
          signature,
          amount,
        },
        timestamp: Date.now(),
      };

      res.status(201).json(response);
    })
  );

  return router;
}
