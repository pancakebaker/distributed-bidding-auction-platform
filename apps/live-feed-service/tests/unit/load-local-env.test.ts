/**
 * Tests optional Node built-in local environment-file loading and precedence behavior.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadLocalEnvironment } from '../../src/config/load-local-env.js';

void test('loads a local env file without replacing explicit process values', async () => {
  const directory = await mkdtemp(join(os.tmpdir(), 'live-feed-env-'));
  const envPath = join(directory, '.env');
  const loadedName = 'LIVE_FEED_PHASE91_LOADED';
  const overrideName = 'LIVE_FEED_PHASE91_OVERRIDE';
  const previousLoaded = process.env[loadedName];
  const previousOverride = process.env[overrideName];

  try {
    delete process.env[loadedName];
    process.env[overrideName] = 'process-value';
    await writeFile(envPath, `${loadedName}=file-value\n${overrideName}=file-value\n`, 'utf8');

    loadLocalEnvironment(envPath);

    assert.equal(process.env[loadedName], 'file-value');
    assert.equal(process.env[overrideName], 'process-value');
  } finally {
    if (previousLoaded === undefined) delete process.env[loadedName];
    else process.env[loadedName] = previousLoaded;
    if (previousOverride === undefined) delete process.env[overrideName];
    else process.env[overrideName] = previousOverride;
    await rm(directory, { recursive: true, force: true });
  }
});

void test('missing local env files are harmless', () => {
  assert.doesNotThrow(() => loadLocalEnvironment(join(os.tmpdir(), 'live-feed-env-does-not-exist', '.env')));
});
