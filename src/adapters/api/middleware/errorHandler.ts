import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import type { ApiErrorResponse } from '../types.js';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }

  static badRequest(message: string): ApiError {
    return new ApiError(message, 400, 'BAD_REQUEST');
  }

  static unauthorized(message: string = 'Unauthorized'): ApiError {
    return new ApiError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError(message, 403, 'FORBIDDEN');
  }

  static notFound(message: string = 'Not found'): ApiError {
    return new ApiError(message, 404, 'NOT_FOUND');
  }

  static conflict(message: string): ApiError {
    return new ApiError(message, 409, 'CONFLICT');
  }

  static rateLimited(message: string = 'Too many requests'): ApiError {
    return new ApiError(message, 429, 'RATE_LIMITED');
  }

  static internal(message: string = 'Internal server error'): ApiError {
    return new ApiError(message, 500, 'INTERNAL_ERROR');
  }
}

/**
 * Global error handler middleware
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log error for debugging (in production, use proper logging)
  console.error('[API Error]', {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  if (err instanceof ApiError) {
    const response: ApiErrorResponse = {
      success: false,
      error: err.message,
      code: err.code,
      timestamp: Date.now(),
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle Solana-specific errors
  if (err.message?.includes('Transaction simulation failed')) {
    const response: ApiErrorResponse = {
      success: false,
      error: 'Transaction simulation failed',
      code: 'TRANSACTION_FAILED',
      timestamp: Date.now(),
    };

    res.status(400).json(response);
    return;
  }

  if (err.message?.includes('insufficient funds') || err.message?.includes('Insufficient')) {
    const response: ApiErrorResponse = {
      success: false,
      error: 'Insufficient funds for transaction',
      code: 'INSUFFICIENT_FUNDS',
      timestamp: Date.now(),
    };

    res.status(400).json(response);
    return;
  }

  // Generic error response
  const response: ApiErrorResponse = {
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message || 'Unknown error',
    code: 'INTERNAL_ERROR',
    timestamp: Date.now(),
  };

  res.status(500).json(response);
};

/**
 * Async handler wrapper to catch async errors
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiErrorResponse = {
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
    timestamp: Date.now(),
  };

  res.status(404).json(response);
}
