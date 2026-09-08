import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import test from 'node:test';
import { JwtAdminTokenVerifier } from '../../src/infrastructure/auth/jwt-admin-token-verifier.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
function token(overrides: Record<string, unknown> = {}): string {
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const claims = encode({
    sub: '1',
    email: 'admin@example.test',
    role: 'admin',
    permissions: ['access-live-feed-admin'],
    iss: 'auction-client',
    aud: 'live-feed-admin',
    iat: 1_000,
    exp: 2_000,
    ...overrides,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(header + '.' + claims);
  signer.end();
  return header + '.' + claims + '.' + signer.sign(privateKey).toString('base64url');
}

function verifier(now = 1_500): JwtAdminTokenVerifier {
  return new JwtAdminTokenVerifier({
    publicKey: publicPem,
    issuer: 'auction-client',
    audience: 'live-feed-admin',
    now: () => now,
  });
}

void test('accepts a valid RS256 admin token', () => {
  assert.equal(verifier().verify(token()).sub, '1');
});
void test('rejects invalid claims and signatures', () => {
  assert.throws(
    () => verifier().verify(token({ exp: 900 })),
    (error: unknown) => (error as { code?: string }).code === 'invalid_admin_token',
  );
  assert.throws(
    () => verifier().verify(token({ iss: 'other' })),
    (error: unknown) => (error as { code?: string }).code === 'invalid_admin_token',
  );
  assert.throws(
    () => verifier().verify(token({ aud: 'other' })),
    (error: unknown) => (error as { code?: string }).code === 'invalid_admin_token',
  );
  assert.throws(
    () => verifier().verify(token({ role: 'user', permissions: [] })),
    (error: unknown) => (error as { code?: string }).code === 'admin_authorization_required',
  );
  const validToken = token();
  const [header, payload, signature] = validToken.split('.');
  const tamperedSignature = Buffer.from(signature, 'base64url');
  tamperedSignature[0] = (tamperedSignature[0] ?? 0) ^ 0x01;
  const invalidSignature = header + '.' + payload + '.' + tamperedSignature.toString('base64url');
  assert.throws(
    () => verifier().verify(invalidSignature),
    (error: unknown) => (error as { code?: string }).code === 'invalid_admin_token',
  );
});
