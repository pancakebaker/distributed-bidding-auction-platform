/**
 * Infrastructure adapter that verifies Laravel-issued RS256 admin tokens using a public key only.
 */
import { createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ApplicationError } from '../../application/errors/application-error.js';
import type {
  AdminTokenClaims,
  AdminTokenVerifier,
} from '../../application/ports/admin-token-verifier.js';
import {
  applicationClaimNames,
  applicationPermissions,
  applicationRoles,
} from './application-auth.js';

/** Configuration for verifying Laravel-issued admin tokens. */
export type JwtAdminTokenVerifierOptions = {
  publicKeyPath?: string;
  publicKey?: string;
  issuer: string;
  audience: string;
  now?: () => number;
};

/**
 * Pins RS256 and validates signature, issuer, audience, timing, subject, and admin
 * permission claims.
 */
export class JwtAdminTokenVerifier implements AdminTokenVerifier {
  private readonly now: () => number;

  public constructor(private readonly options: JwtAdminTokenVerifierOptions) {
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  /**
   * Verifies a compact JWT and returns only the validated admin claims.
   */
  public verify(token: string): AdminTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) throw invalidToken();

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseJson<Record<string, unknown>>(encodedHeader);
    const payload = parseJson<Record<string, unknown>>(encodedPayload);
    if (header.alg !== 'RS256' || header.typ !== 'JWT') throw invalidToken();

    let publicKey: string | Buffer;
    try {
      publicKey = this.options.publicKey ?? readFileSync(this.options.publicKeyPath ?? '');
    } catch (error) {
      throw new ApplicationError(
        'Admin token verification is unavailable.',
        503,
        'admin_token_verification_unavailable',
        {
          cause: error,
        },
      );
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(encodedHeader + '.' + encodedPayload);
    verifier.end();
    if (!verifier.verify(publicKey, decodeBase64Url(encodedSignature))) throw invalidToken();

    return validateClaims(payload, this.options, this.now());
  }
}

function validateClaims(
  payload: Record<string, unknown>,
  options: JwtAdminTokenVerifierOptions,
  now: number,
): AdminTokenClaims {
  const sub = stringClaim(payload.sub);
  const iss = stringClaim(payload.iss);
  const iat = numberClaim(payload.iat);
  const exp = numberClaim(payload.exp);
  const aud = audienceClaim(payload.aud);
  const nbf = payload.nbf === undefined ? undefined : numberClaim(payload.nbf);
  const permissions = permissionsClaim(payload[applicationClaimNames.permissions]);
  const role = stringClaim(payload[applicationClaimNames.role]);
  const jti = stringClaim(payload.jti);

  if (
    !sub ||
    iss !== options.issuer ||
    !aud.includes(options.audience) ||
    exp <= now ||
    iat > now + 30 ||
    (nbf !== undefined && nbf > now) ||
    !jti ||
    !permissions
  ) {
    throw invalidToken();
  }
  if (
    role !== applicationRoles.admin ||
    !permissions.includes(applicationPermissions.liveFeedAdmin)
  ) {
    throw new ApplicationError(
      'Admin authorization is required.',
      403,
      'admin_authorization_required',
    );
  }

  return {
    sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    role: role || undefined,
    permissions,
    iss,
    aud: Array.isArray(payload.aud) ? aud : (aud[0] ?? ''),
    iat,
    exp,
    nbf,
    jti,
  };
}

function parseJson<T>(encoded: string): T {
  try {
    return JSON.parse(decodeBase64Url(encoded).toString('utf8')) as T;
  } catch (error) {
    throw new ApplicationError('Invalid admin token.', 401, 'invalid_admin_token', {
      cause: error,
    });
  }
}

function decodeBase64Url(value: string): Buffer {
  try {
    return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch (error) {
    throw new ApplicationError('Invalid admin token.', 401, 'invalid_admin_token', {
      cause: error,
    });
  }
}

function stringClaim(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberClaim(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function permissionsClaim(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.every((permission): permission is string => typeof permission === 'string')
    ? value
    : undefined;
}

function audienceClaim(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function invalidToken(): ApplicationError {
  return new ApplicationError('Invalid admin token.', 401, 'invalid_admin_token');
}
