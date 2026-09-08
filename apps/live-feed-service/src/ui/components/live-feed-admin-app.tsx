/**
 * Universal React dashboard for the read-only live-feed operations page.
 */
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { LiveFeedHistoryResult } from '../../application/history/live-feed-history-types.js';
import type { LiveFeedDashboardSnapshot } from '../../application/diagnostics/get-live-feed-dashboard.js';
import { adminActivityEvent, adminLiveFeedRoom } from '../../transport/websocket/admin-live-feed-publisher.js';
import { mergeRecentActivity } from './live-feed-admin-state.js';

export type LiveFeedAdminAppProps = {
  initialState: LiveFeedDashboardSnapshot;
};

type HistoryFilters = {
  from: string;
  to: string;
  auctionId: string;
  eventType: string;
  outcome: string;
  limit: string;
};

function formatBytes(bytes: number): string {
  return Math.round(bytes / 1024 / 1024) + ' MB';
}

function formatUptime(seconds: number): string {
  return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
}

function historyQuery(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      if (key === 'from' || key === 'to') {
        const date = new Date(value);
        params.set(key, Number.isNaN(date.getTime()) ? value : date.toISOString());
      } else {
        params.set(key, value);
      }
    }
  }
  return params.toString();
}

/**
 * Renders the SSR-compatible dashboard and subscribes to authorized admin activity after hydration.
 */
export function LiveFeedAdminApp({ initialState }: LiveFeedAdminAppProps): React.JSX.Element {
  const [state, setState] = useState(initialState);
  const [filters, setFilters] = useState<HistoryFilters>({
    from: '',
    to: '',
    auctionId: '',
    eventType: '',
    outcome: '',
    limit: '100',
  });
  const [history, setHistory] = useState<LiveFeedHistoryResult | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
        recentActivity: mergeRecentActivity(current.recentActivity, activity),
      }));
    });

    return () => {
      socket.off(adminActivityEvent);
      socket.disconnect();
    };
  }, []);

  async function searchHistory(): Promise<void> {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch('/admin/api/history?' + historyQuery(filters));
      const body = (await response.json()) as LiveFeedHistoryResult & { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? 'History query failed.');
      }
      setHistory(body);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'History query failed.');
    } finally {
      setHistoryLoading(false);
    }
  }

  const pdfHref = '/admin/api/history.pdf?' + historyQuery(filters);

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
            <dt>History PostgreSQL</dt>
            <dd>
              {state.database.configured ? (state.database.available ? 'Configured' : 'Degraded') : 'Not configured'}
            </dd>
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

      <section aria-labelledby="history-heading" className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Durable operational history · stored and returned in UTC</p>
            <h2 id="history-heading">History</h2>
          </div>
          <span>{history?.count ?? 0} returned</span>
        </div>
        <form
          className="history-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void searchHistory();
          }}
        >
          <label>
            From (local){' '}
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(event) => setFilters({ ...filters, from: event.target.value })}
            />
          </label>
          <label>
            To (local){' '}
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(event) => setFilters({ ...filters, to: event.target.value })}
            />
          </label>
          <label>
            Auction ID{' '}
            <input
              value={filters.auctionId}
              onChange={(event) => setFilters({ ...filters, auctionId: event.target.value })}
            />
          </label>
          <label>
            Event type{' '}
            <input
              value={filters.eventType}
              onChange={(event) => setFilters({ ...filters, eventType: event.target.value })}
            />
          </label>
          <label>
            Outcome
            <select
              value={filters.outcome}
              onChange={(event) => setFilters({ ...filters, outcome: event.target.value })}
            >
              <option value="">All outcomes</option>
              <option value="applied">Applied</option>
              <option value="stale">Stale</option>
              <option value="ignored">Ignored</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label>
            Limit{' '}
            <input
              type="number"
              min="1"
              max="500"
              value={filters.limit}
              onChange={(event) => setFilters({ ...filters, limit: event.target.value })}
            />
          </label>
          <div className="history-actions">
            <button type="submit" disabled={historyLoading}>
              {historyLoading ? 'Searching…' : 'Search'}
            </button>
            <a className="button-link" href={pdfHref}>
              Download PDF
            </a>
          </div>
        </form>
        {historyError ? (
          <p className="error-state" role="alert">
            {historyError}
          </p>
        ) : null}
        {!history ? (
          <p className="empty-state">Search the bounded durable history range to view records.</p>
        ) : history.rows.length === 0 ? (
          <p className="empty-state">No history matched the selected filters.</p>
        ) : (
          <div className="history-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Processed (UTC)</th>
                  <th>Event</th>
                  <th>Auction</th>
                  <th>Version</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.processedAt}</td>
                    <td>{row.eventType}</td>
                    <td>{row.auctionId ?? '-'}</td>
                    <td>{row.aggregateVersion ?? '-'}</td>
                    <td>{row.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
