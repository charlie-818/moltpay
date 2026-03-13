export {
  createApiServer,
  startApiServer,
  createAndStartApiServer,
} from './server.js';

export type {
  ApiConfig,
  ApiResponse,
  ApiErrorResponse,
  CreateWalletResponse,
  GetBalanceResponse,
  SendPaymentResponse,
  VerifyPaymentResponse,
  GetHistoryResponse,
  RequestAirdropResponse,
  CreateWalletRequest,
  GetBalanceRequest,
  SendPaymentRequest,
  VerifyPaymentRequest,
  GetHistoryRequest,
  RequestAirdropRequest,
} from './types.js';

export {
  CreateWalletRequestSchema,
  GetBalanceRequestSchema,
  SendPaymentRequestSchema,
  VerifyPaymentRequestSchema,
  GetHistoryRequestSchema,
  RequestAirdropSchema,
} from './types.js';

export { ApiError, asyncHandler } from './middleware/errorHandler.js';
export { createAuthMiddleware } from './middleware/auth.js';
export { validateBody, validateQuery, validateParams } from './middleware/validation.js';
