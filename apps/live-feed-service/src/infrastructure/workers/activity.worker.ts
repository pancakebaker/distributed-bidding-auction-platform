/**
 * Worker entrypoint for the isolated live-feed diagnostic CPU calculation.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { calculateAuctionActivity } from '../../application/activity/calculate-auction-activity.js';
import type { ActivityInput } from '../../application/activity/calculate-auction-activity.js';

if (!parentPort) {
  throw new Error('Activity worker requires a parent port.');
}

const result = calculateAuctionActivity(workerData as ActivityInput);
parentPort.postMessage(result);
