/**
 * Small application error model for safe HTTP classification at service boundaries.
 */

/**
 * Error with a client-safe status and stable machine-readable code.
 */
export class ApplicationError extends Error {
  /**
   * HTTP status code used when this error crosses the HTTP boundary.
   */
  public readonly statusCode: number;
  /**
   * Stable client-safe error code.
   */
  public readonly code: string;

  public constructor(
    message: string,
    statusCode = 500,
    code = 'internal_error',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApplicationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
