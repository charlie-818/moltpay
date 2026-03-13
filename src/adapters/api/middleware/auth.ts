import type { Request, Response, NextFunction } from 'express';

/**
 * API Key authentication middleware
 *
 * Validates that requests include a valid API key in the Authorization header
 * Format: Authorization: Bearer <api-key>
 */
export function createAuthMiddleware(apiKey?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth if no API key is configured
    if (!apiKey) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: 'Missing Authorization header',
        code: 'UNAUTHORIZED',
        timestamp: Date.now(),
      });
      return;
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({
        success: false,
        error: 'Invalid Authorization format. Use: Bearer <api-key>',
        code: 'INVALID_AUTH_FORMAT',
        timestamp: Date.now(),
      });
      return;
    }

    // Constant-time comparison to prevent timing attacks
    if (!constantTimeCompare(token, apiKey)) {
      res.status(403).json({
        success: false,
        error: 'Invalid API key',
        code: 'FORBIDDEN',
        timestamp: Date.now(),
      });
      return;
    }

    next();
  };
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
