/**
 * Loads the optional repository-root environment file without changing deployment configuration semantics.
 */
import { loadEnvFile } from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultEnvFilePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..', '.env');

/**
 * Loads a local environment file when present; existing process variables remain authoritative.
 *
 * @param envFilePath - Optional environment-file path used by tests or local tooling.
 */
export function loadLocalEnvironment(envFilePath: string = defaultEnvFilePath): void {
  try {
    loadEnvFile(envFilePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
