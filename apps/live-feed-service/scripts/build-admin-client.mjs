/**
 * Bundles the small browser hydration entry for the live-feed operations page.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['src/ui/client/live-feed-admin-entry.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/ui/live-feed-admin.js',
});
