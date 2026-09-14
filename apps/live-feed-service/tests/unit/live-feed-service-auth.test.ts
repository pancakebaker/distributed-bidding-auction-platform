import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BiddingLiveFeedAccessClient } from '../../src/infrastructure/bidding/bidding-live-feed-access-client.js';
import { ServiceTokenIssuer } from '../../src/infrastructure/auth/service-token-issuer.js';

async function withKey<T>(run: (path: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'live-feed-service-auth-'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const path = join(directory, 'service-private.pem');
  await writeFile(path, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  try {
    return await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

void test('service token issuer emits short-lived RS256 tokens with required claims', async () => {
  await withKey((privateKeyPath) => {
    const issuer = new ServiceTokenIssuer({
      privateKeyPath,
      issuer: 'dbap-live-feed-service',
      subject: 'live-feed-service',
      audience: 'dbap-bidding-service',
      keyId: 'live-feed-service-v1',
      now: () => new Date('2026-09-05T12:00:00Z'),
      ttlSeconds: 30,
    });
    const [header, payload] = issuer.issue().split('.');
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;

    assert.equal(decodedHeader.alg, 'RS256');
    assert.equal(decodedHeader.kid, 'live-feed-service-v1');
    assert.equal(decodedPayload.iss, 'dbap-live-feed-service');
    assert.equal(decodedPayload.sub, 'live-feed-service');
    assert.equal(decodedPayload.aud, 'dbap-bidding-service');
    assert.equal(decodedPayload.exp, (decodedPayload.iat as number) + 30);
    assert.equal(typeof decodedPayload.jti, 'string');
  });
});

void test('Bidding access client sends a fresh bearer token and maps decisions', async () => {
  await withKey(async (privateKeyPath) => {
    let request: Request | undefined;
    const issuer = new ServiceTokenIssuer({
      privateKeyPath,
      issuer: 'dbap-live-feed-service',
      subject: 'live-feed-service',
      audience: 'dbap-bidding-service',
      keyId: 'live-feed-service-v1',
    });
    const client = new BiddingLiveFeedAccessClient({
      baseUrl: 'http://bidding.internal/',
      issuer,
      fetchImpl: (input, init) => {
        request = new Request(input, init);
        return new Response(JSON.stringify({ allowed: true }), { status: 200 });
      },
    });

    assert.deepEqual(
      await client.canExposeAuctionLiveFeed('11111111-1111-1111-1111-111111111111'),
      { kind: 'allowed' },
    );
    assert.equal(request?.url, 'http://bidding.internal/internal/live-feed/access');
    assert.match(request?.headers.get('authorization') ?? '', /^Bearer [^.]+\.[^.]+\.[^.]+$/);
    assert.ok(request);
    const body: unknown = JSON.parse(await request.text());
    assert.ok(typeof body === 'object' && body !== null && 'auctionId' in body);
    assert.equal(body.auctionId, '11111111-1111-1111-1111-111111111111');
  });
});

void test('Bidding access client fails closed for denied, missing, and unavailable decisions', async () => {
  await withKey(async (privateKeyPath) => {
    const issuer = new ServiceTokenIssuer({
      privateKeyPath,
      issuer: 'dbap-live-feed-service',
      subject: 'live-feed-service',
      audience: 'dbap-bidding-service',
      keyId: 'live-feed-service-v1',
    });
    const responses = [403, 404, 503];
    for (const status of responses) {
      const client = new BiddingLiveFeedAccessClient({
        baseUrl: 'http://bidding.internal',
        issuer,
        fetchImpl: () => Promise.resolve(new Response(null, { status })),
      });
      assert.deepEqual(
        await client.canExposeAuctionLiveFeed('11111111-1111-1111-1111-111111111111'),
        {
          kind: status === 403 ? 'denied' : status === 404 ? 'not_found' : 'unavailable',
        },
      );
    }
  });
});
