/**
 * Universal React dashboard for the read-only live-feed operations page.
 */
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { LiveFeedDashboardSnapshot } from '../../application/diagnostics/get-live-feed-dashboard.js';
import { adminActivityEvent, adminLiveFeedRoom } from '../../transport/websocket/admin-live-feed-publisher.js';

export type LiveFeedAdminAppProps = {
  initialState: LiveFeedDashboardSnapshot;
};

function formatBytes(bytes: number): string {
  return Math.round(bytes / 1024 / 1024) + ' MB';
}

function formatUptime(seconds: number): string {
  return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
}

/**
 * Renders the SSR-compatible dashboard and subscribes to authorized admin activity after hydration.
 */
export function LiveFeedAdminApp({ initialState }: LiveFeedAdminAppProps): React.JSX.Element {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const socket = io();
    socket.emit('admin:subscribe', (result: { ok: boolean }) => {
      if (!result.ok) {
        socket.disconnect();
      }
    });
    socket.on(adminActivityEvent, (activity: LiveFeedDashboardSnapshot['recentActivity'][number]) => {
      setState((current) => ({
        ...current,
        recentActivity: [activity, ...current.recentActivity.filter((item) => item.eventId !== activity.eventId)].slice(
          0,
          50,
        ),
      }));
    });

    return () => {
      socket.off(adminActivityEvent);
      socket.disconnect();
    };
  }, []);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Live Feed Operations</p>
          <h1>What is the Live Feed Service doing right now?</h1>
        </div>
        <span className={'status status-' + state.service.status}>{state.service.status}</span>
      </header>

      <section aria-labelledby="service-heading" className="panel-grid">
        <article className="panel">
          <h2 id="service-heading">Service</h2>
          <dl>
            <dt>Node</dt>
            <dd>{state.service.nodeVersion}</dd>
            <dt>PID</dt>
            <dd>{state.service.pid}</dd>
            <dt>Uptime</dt>
            <dd>{formatUptime(state.service.uptimeSeconds)}</dd>
          </dl>
        </article>
        <article className="panel">
          <h2>Runtime</h2>
          <dl>
            <dt>Event-loop utilization</dt>
            <dd>{state.runtime.eventLoop.utilization.toFixed(3)}</dd>
            <dt>Event-loop p95 delay</dt>
            <dd>{state.runtime.eventLoop.delayMs.p95.toFixed(2)} ms</dd>
            <dt>Event-loop p99 delay</dt>
            <dd>{state.runtime.eventLoop.delayMs.p99.toFixed(2)} ms</dd>
          </dl>
        </article>
        <article className="panel">
          <h2>Memory</h2>
          <dl>
            <dt>RSS</dt>
            <dd>{formatBytes(state.runtime.memory.rss)}</dd>
            <dt>Heap used</dt>
            <dd>{formatBytes(state.runtime.memory.heapUsed)}</dd>
            <dt>Heap total</dt>
            <dd>{formatBytes(state.runtime.memory.heapTotal)}</dd>
            <dt>External / buffers</dt>
            <dd>
              {formatBytes(state.runtime.memory.external)} / {formatBytes(state.runtime.memory.arrayBuffers)}
            </dd>
          </dl>
        </article>
        <article className="panel">
          <h2>Connections</h2>
          <dl>
            <dt>RabbitMQ</dt>
            <dd>{state.messaging.rabbitMqConnected ? 'Connected' : 'Degraded'}</dd>
            <dt>Redis</dt>
            <dd>{state.redis.connected ? 'Connected' : 'Degraded'}</dd>
            <dt>WebSocket clients</dt>
            <dd>{state.websocket.connectedClients}</dd>
            <dt>Active rooms</dt>
            <dd>{state.websocket.activeRooms}</dd>
          </dl>
        </article>
      </section>

      <section aria-labelledby="activity-heading" className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Bounded in-memory operational buffer</p>
            <h2 id="activity-heading">Recent live activity</h2>
          </div>
          <span>{state.recentActivity.length} items</span>
        </div>
        {state.recentActivity.length === 0 ? (
          <p className="empty-state">No downstream live-feed activity observed since startup.</p>
        ) : (
          <ul className="activity-list" aria-live="polite">
            {state.recentActivity.map((activity) => (
              <li key={activity.eventId}>
                <span className={'outcome outcome-' + activity.outcome}>{activity.outcome}</span>
                <strong>{activity.eventType}</strong>
                <span>{activity.auctionId ?? 'service event'}</span>
                <time dateTime={activity.receivedAt}>{activity.receivedAt}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="diagnostics-heading" className="panel">
        <h2 id="diagnostics-heading">Read-only diagnostics</h2>
        <p>These probes are observational and do not alter auction or projection state.</p>
        <nav className="diagnostics-links" aria-label="Runtime diagnostics">
          <a href="/diagnostics/runtime">Runtime snapshot</a>
          <a href="/diagnostics/runtime/thread-pool">libuv thread pool</a>
          <a href="/diagnostics/runtime/child-process">Child process</a>
          <a href="/diagnostics/live-feed/activity">Worker activity</a>
        </nav>
      </section>
    </main>
  );
}

export const adminSocketRoom = adminLiveFeedRoom;
