/**
 * Centralized Express error mapping that keeps internal failure details out of HTTP responses.
 */
import type { ErrorRequestHandler } from 'express';
import { ApplicationError } from '../../application/errors/application-error.js';

/**
 * Creates the live-feed HTTP error middleware.
 */
export function createHttpErrorHandler(): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    if (error instanceof ApplicationError) {
      response.status(error.statusCode).json({
        error: error.code,
        message: error.statusCode >= 500 ? 'Internal server error.' : error.message,
      });
      return;
    }

    response.status(500).json({
      error: 'internal_error',
      message: 'Internal server error.',
    });
  };
}
