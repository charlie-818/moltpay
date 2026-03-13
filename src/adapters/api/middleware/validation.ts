import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Creates a validation middleware for request body
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors,
          timestamp: Date.now(),
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        code: 'INVALID_BODY',
        timestamp: Date.now(),
      });
    }
  };
}

/**
 * Creates a validation middleware for query parameters
 */
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: errors,
          timestamp: Date.now(),
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        code: 'INVALID_QUERY',
        timestamp: Date.now(),
      });
    }
  };
}

/**
 * Creates a validation middleware for URL parameters
 */
export function validateParams<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          error: 'Invalid URL parameters',
          code: 'VALIDATION_ERROR',
          details: errors,
          timestamp: Date.now(),
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: 'Invalid URL parameters',
        code: 'INVALID_PARAMS',
        timestamp: Date.now(),
      });
    }
  };
}

/**
 * Solana address validation schema
 */
export const SolanaAddressSchema = z.string().refine(
  (value) => {
    // Basic check: base58 characters and length between 32-44
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(value);
  },
  { message: 'Invalid Solana address format' }
);

/**
 * Transaction signature validation schema
 */
export const TransactionSignatureSchema = z.string().refine(
  (value) => {
    // Signatures are base58 encoded and typically 87-88 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
    return base58Regex.test(value);
  },
  { message: 'Invalid transaction signature format' }
);
