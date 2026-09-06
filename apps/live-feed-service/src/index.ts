/**
 * Process entrypoint that starts the live-feed service and handles shutdown signals.
 */
import { createLiveFeedService } from './service.js';

const service = createLiveFeedService();

process.on('SIGINT', () => {
  void service.stop().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void service.stop().finally(() => process.exit(0));
});

service.start().catch((error) => {
  console.error('Live Feed Service failed to start.', error);
  process.exitCode = 1;
});
