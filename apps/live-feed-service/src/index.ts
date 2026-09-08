/**
 * Process entrypoint that starts the live-feed service and handles signals and fatal failures.
 */
import { createLiveFeedService } from './application/live-feed-service.js';
import { ProcessLifecycle } from './infrastructure/runtime/process-lifecycle.js';

const service = createLiveFeedService();
const lifecycle = new ProcessLifecycle(
  async (reason) => {
    console.info(`Live Feed Service shutdown requested: ${reason}.`);
    await service.stop();
  },
  process,
  (code) => {
    process.exitCode = code;
  },
);

lifecycle.register();

service.start().catch((error) => {
  console.error('Live Feed Service failed to start.', error instanceof Error ? error.name : typeof error);
  void lifecycle.shutdown('startup-failure', true);
});
