/**
 * Application-facing verification boundary for short-lived Laravel-issued admin tokens.
 */

/**
 * Minimal claims required to establish a Node admin session.
 */
export type AdminTokenClaims = {
  sub: string;
  email?: string;
  role?: string;
  permissions?: string[];
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  nbf?: number;
  jti: string;
};

/**
 * Verifies an externally issued admin token without exposing token-library details to routes.
 */
export interface AdminTokenVerifier {
  verify(token: string): AdminTokenClaims;
}
