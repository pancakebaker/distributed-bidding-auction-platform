/**
 * Tests the signed-cookie admin authorization boundary.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminAuth } from '../../src/transport/http/admin/admin-auth.js';

void test('admin auth creates a secure HttpOnly same-site cookie and validates it', () => {
  const auth = new AdminAuth({
    username: 'admin',
    password: 'password',
    secret: 'test-secret',
    secure: false,
    now: () => 1_000_000,
  });
  const cookie = auth.authenticate('admin', 'password');

  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Path=\/admin/);
  assert.doesNotMatch(cookie, /password/);
  assert.equal(auth.isAuthorizedCookie(cookie), true);
  assert.equal(auth.isAuthorizedCookie(undefined), false);
});

void test('admin auth rejects invalid and expired sessions', () => {
  let now = 1_000_000;
  const auth = new AdminAuth({
    username: 'admin',
    password: 'password',
    secret: 'test-secret',
    now: () => now,
    sessionLifetimeSeconds: 10,
  });
  const cookie = auth.authenticate('admin', 'password');

  assert.equal(auth.authenticate('admin', 'wrong'), null);
  assert.equal(auth.isAuthorizedCookie(cookie ?? ''), true);
  now += 11_000;
  assert.equal(auth.isAuthorizedCookie(cookie ?? ''), false);
});
