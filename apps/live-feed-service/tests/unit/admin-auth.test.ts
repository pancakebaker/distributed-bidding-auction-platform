import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminAuth } from '../../src/transport/http/admin/admin-auth.js';

void test('admin auth creates and validates a signed HttpOnly same-site root cookie', () => {
  const auth = new AdminAuth({ secret: 'test-secret', secure: false, now: () => 1_000_000 });
  const cookie = auth.createSession();
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=900/);
  assert.doesNotMatch(cookie, /password/);
  assert.equal(auth.isAuthorizedCookie(cookie), true);
  assert.equal(auth.isAuthorizedCookie(undefined), false);
});

void test('admin auth rejects expired sessions and adds Secure in production mode', () => {
  let now = 1_000_000;
  const auth = new AdminAuth({
    secret: 'test-secret',
    secure: true,
    now: () => now,
    sessionLifetimeSeconds: 10,
  });
  const cookie = auth.createSession();
  assert.match(cookie, /Secure/);
  assert.equal(auth.isAuthorizedCookie(cookie), true);
  now += 11_000;
  assert.equal(auth.isAuthorizedCookie(cookie), false);
});
