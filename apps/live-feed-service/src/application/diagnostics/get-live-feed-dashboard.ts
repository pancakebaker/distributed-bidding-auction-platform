/**
 * Builds a framework-agnostic, read-only snapshot for the live-feed operations page.
 */
import type { EventLoopMetrics, EventLoopMonitor } from '../../infrastructure/runtime/event-loop-monitor.js';
import { getProcessMetrics, type ProcessMetrics } from '../../infrastructure/runtime/process-metrics.js';
import type { LiveFeedHistoryStore } from '../ports/live-feed-history-store.js';
import type { OperationalActivity, RecentActivityReader } from './recent-activity-store.js';

/**
 * Safe dashboard runtime snapshot shared by SSR and browser hydration.
 */
export type LiveFeedDashboardSnapshot = {
  service: {
    name: 'live-feed-service';
    status: 'ok' | 'degraded';
    pid: number;
    nodeVersion: string;
    uptimeSeconds: number;
  };
  runtime: {
    eventLoop: EventLoopMetrics;
    memory: ProcessMetrics['memory'];
  };
  messaging: {
    rabbitMqConnected: boolean;
  };
  redis: {
    connected: boolean;
  };
  websocket: {
    connectedClients: number;
    activeRooms: number;
  };
  recentActivity: readonly OperationalActivity[];
  database: {
    configured: boolean;
    available: boolean;
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
};

/**
 * Inputs needed to build the dashboard without Express, Redis, RabbitMQ, or Socket.IO types.
 */
export type LiveFeedDashboardDependencies = {
  eventLoopMonitor: EventLoopMonitor;
  recentActivity: RecentActivityReader;
  historyStore: LiveFeedHistoryStore;
  rabbitMqConnected: boolean;
  redisConnected: boolean;
  connectedClients: number;
  activeRooms: number;
};

/**
 * Collects safe runtime and operational data for one page render.
 */
export function getLiveFeedDashboard(dependencies: LiveFeedDashboardDependencies): LiveFeedDashboardSnapshot {
  const processMetrics = getProcessMetrics();

  return {
    service: {
      name: 'live-feed-service',
      status: dependencies.rabbitMqConnected && dependencies.redisConnected ? 'ok' : 'degraded',
      pid: processMetrics.pid,
      nodeVersion: processMetrics.nodeVersion,
      uptimeSeconds: processMetrics.uptimeSeconds,
    },
    runtime: {
      eventLoop: dependencies.eventLoopMonitor.snapshot(),
      memory: processMetrics.memory,
    },
    messaging: {
      rabbitMqConnected: dependencies.rabbitMqConnected,
    },
    redis: {
      connected: dependencies.redisConnected,
    },
    websocket: {
      connectedClients: dependencies.connectedClients,
      activeRooms: dependencies.activeRooms,
    },
    recentActivity: dependencies.recentActivity.snapshot(),
    database: dependencies.historyStore.status(),
  };
}
