/** Issues short-lived RS256 credentials for the internal Live Feed boundary. */
import { createPrivateKey, createSign, randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Configuration for internal Live Feed service-token issuance. */
export type ServiceTokenIssuerOptions = {
  privateKeyPath: string;
  issuer: string;
  subject: string;
  audience: string;
  keyId: string;
  ttlSeconds?: number;
  now?: () => Date;
};

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/** Creates signed service tokens without exposing private key material. */
export class ServiceTokenIssuer {
  private readonly key: KeyObject;
  private readonly options: Required<Omit<ServiceTokenIssuerOptions, 'now'>> & { now: () => Date };

  public constructor(options: ServiceTokenIssuerOptions) {
    this.key = createPrivateKey(readFileSync(options.privateKeyPath));
    const details = this.key.asymmetricKeyDetails;
    if (this.key.asymmetricKeyType !== 'rsa' || !details?.modulusLength || details.modulusLength < 2048) {
      throw new Error('Live Feed service token key must be an RSA key of at least 2048 bits.');
    }
    const ttlSeconds = options.ttlSeconds ?? 30;
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 60) {
      throw new Error('Live Feed service token TTL must be between 1 and 60 seconds.');
    }
    this.options = { ...options, ttlSeconds, now: options.now ?? (() => new Date()) };
  }

  /** Issues one short-lived RS256 service token. */
  public issue(): string {
    const issuedAt = Math.floor(this.options.now().getTime() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: this.options.keyId }));
    const payload = base64Url(JSON.stringify({
      iss: this.options.issuer,
      sub: this.options.subject,
      aud: this.options.audience,
      jti: randomUUID(),
      iat: issuedAt,
      nbf: issuedAt,
      exp: issuedAt + this.options.ttlSeconds,
    }));
    const input = `${header}.${payload}`;
    const signature = createSign('RSA-SHA256').update(input).sign(this.key);
    return `${input}.${base64Url(signature)}`;
  }
}
