import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { SystemAdminJwtTokenVerifier } from '../../src/infrastructure/auth/system-admin-jwt-token-verifier.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(
  overrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
) {
  const header = encode({
    alg: 'RS256',
    typ: 'JWT',
    kid: 'system-admin-development-1',
    ...headerOverrides,
  });
  const payload = encode({
    sub: 'system-admin-subject',
    role: 'SystemAdministrator',
    permissions: ['system.monitor', 'livefeed.admin', 'system.diagnostics'],
    iss: 'dbap-system-admin',
    aud: 'live-feed-admin',
    iat: 1_000,
    exp: 2_000,
    jti: 'system-token-1',
    ...overrides,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(header + '.' + payload);
  signer.end();
  return header + '.' + payload + '.' + signer.sign(privateKey).toString('base64url');
}

function verifier(now = 1_500): SystemAdminJwtTokenVerifier {
  return new SystemAdminJwtTokenVerifier({
    publicKey: publicPem,
    issuer: 'dbap-system-admin',
    audience: 'live-feed-admin',
    expectedKid: 'system-admin-development-1',
    now: () => now,
  });
}

void test('accepts a valid independent system-admin token', () => {
  const claims = verifier().verify(token());
  assert.equal(claims.sub, 'system-admin-subject');
  assert.equal(claims.role, 'SystemAdministrator');
  assert.deepEqual(claims.permissions, ['system.monitor', 'livefeed.admin', 'system.diagnostics']);
});

void test('rejects issuer, audience, kid, role, permission, expiry, and signature failures', () => {
  const rejected = [
    token({ iss: 'auction-client' }),
    token({ aud: 'other' }),
    token({}, { kid: 'wrong-kid' }),
    token({ role: 'admin' }),
    token({ permissions: ['system.monitor'] }),
    token({ exp: 1_499 }),
  ];
  for (const value of rejected) {
    assert.throws(
      () => verifier().verify(value),
      (error: unknown) => (error as { code?: string }).code === 'invalid_admin_token',
    );
  }

  const valid = token();
  const [header, payload, signature] = valid.split('.');
  const tampered = Buffer.from(signature, 'base64url');
  tampered[0] = (tampered[0] ?? 0) ^ 1;
  assert.throws(
    () => verifier().verify(header + '.' + payload + '.' + tampered.toString('base64url')),
    (error: unknown) => (error as { code?: string }).code === 'invalid_admin_token',
  );
});
