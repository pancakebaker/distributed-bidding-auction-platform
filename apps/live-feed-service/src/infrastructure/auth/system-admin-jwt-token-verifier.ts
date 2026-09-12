/**
 * Validates independent system-administrator JWTs before Live Feed admin handoff.
 */
import { createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ApplicationError } from '../../application/errors/application-error.js';
import type {
  AdminTokenClaims,
  AdminTokenVerifier,
} from '../../application/ports/admin-token-verifier.js';

/** Configuration for the independent system-administrator JWT trust boundary. */
export type SystemAdminJwtTokenVerifierOptions = {
  publicKeyPath?: string;
  publicKey?: string;
  publicKeys?: Record<string, string>;
  issuer: string;
  audience: string;
  expectedKid: string;
  now?: () => number;
};

/** Verifies only the independent SystemAdministrator Live Feed contract. */
export class SystemAdminJwtTokenVerifier implements AdminTokenVerifier {
  private readonly now: () => number;

  public constructor(private readonly options: SystemAdminJwtTokenVerifierOptions) {
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  /** Validates signature, trust claims, authorization claims, and token lifetime. */
  public verify(token: string): AdminTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) throw invalidToken();
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseJson<Record<string, unknown>>(encodedHeader);
    const payload = parseJson<Record<string, unknown>>(encodedPayload);
    if (header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string')
      throw invalidToken();

    const keyPath = this.options.publicKeys?.[header.kid];
    if (this.options.publicKeys && !keyPath) throw invalidToken();
    if (!this.options.publicKeys && header.kid !== this.options.expectedKid) throw invalidToken();

    let publicKey: string | Buffer;
    try {
      const configuredKey = keyPath ?? this.options.publicKeyPath;
      publicKey =
        this.options.publicKey ??
        (configuredKey?.includes('-----BEGIN') ? configuredKey : readFileSync(configuredKey ?? ''));
    } catch (error) {
      throw new ApplicationError(
        'Admin token verification is unavailable.',
        503,
        'admin_token_verification_unavailable',
        { cause: error },
      );
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(encodedHeader + '.' + encodedPayload);
    verifier.end();
    if (!verifier.verify(publicKey, decodeBase64Url(encodedSignature))) throw invalidToken();

    const now = this.now();
    const sub = stringClaim(payload.sub);
    const iss = stringClaim(payload.iss);
    const aud = audienceClaim(payload.aud);
    const role = stringClaim(payload.role);
    const permissions = permissionsClaim(payload.permissions);
    const iat = numberClaim(payload.iat);
    const exp = numberClaim(payload.exp);
    const nbf = payload.nbf === undefined ? undefined : numberClaim(payload.nbf);
    const jti = stringClaim(payload.jti);
    if (
      !sub ||
      iss !== this.options.issuer ||
      !aud.includes(this.options.audience) ||
      role !== 'SystemAdministrator' ||
      !permissions?.includes('livefeed.admin') ||
      !jti ||
      !Number.isFinite(iat) ||
      !Number.isFinite(exp) ||
      exp <= now ||
      iat > now + 30 ||
      (nbf !== undefined && (!Number.isFinite(nbf) || nbf > now))
    )
      throw invalidToken();

    return {
      sub,
      role,
      permissions,
      iss,
      aud: Array.isArray(payload.aud) ? aud : (aud[0] ?? ''),
      iat,
      exp,
      nbf,
      jti,
    };
  }
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
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function stringClaim(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberClaim(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function permissionsClaim(value: unknown): string[] | undefined {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((permission): permission is string => typeof permission === 'string')
    ? value
    : undefined;
}

function audienceClaim(value: unknown): string[] {
  return typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
}

function invalidToken(): ApplicationError {
  return new ApplicationError('Invalid admin token.', 401, 'invalid_admin_token');
}
