/**
 * Verifies the hydrated admin client keeps the established Socket.IO activity contract.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/ui/components/live-feed-admin-app.tsx',
);
const clientSource = readFileSync(clientPath, 'utf8');

void test('hydrated admin client subscribes, updates state, and cleans up admin activity listeners', () => {
  assert.match(clientSource, /adminSocketEvents\.subscribe/);
  assert.match(clientSource, /socket\.on\(\s*adminSocketEvents\.activity/);
  assert.match(clientSource, /mergeRecentActivity\(current\.recentActivity, activity\)/);
  assert.match(clientSource, /socket\.off\(adminSocketEvents\.activity\)/);
  assert.match(clientSource, /socket\.disconnect\(\)/);
});
