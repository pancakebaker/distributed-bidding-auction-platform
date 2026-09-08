/**
 * Server-side renderer for the live-feed operations dashboard.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { LiveFeedAdminApp } from '../components/live-feed-admin-app.js';
import type { LiveFeedDashboardSnapshot } from '../../application/diagnostics/get-live-feed-dashboard.js';

const rootId = 'live-feed-admin-root';
const stateScriptId = 'live-feed-admin-state';

/**
 * Renders meaningful initial dashboard HTML and a safely escaped hydration state.
 */
export function renderLiveFeedAdmin(snapshot: LiveFeedDashboardSnapshot): string {
  const markup = renderToString(<LiveFeedAdminApp initialState={snapshot} />);
  const serializedState = serializeInitialState(snapshot);

  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Live Feed Operations</title><link rel="stylesheet" href="/admin/live-feed.css"></head>' +
    '<body><div id="' +
    rootId +
    '">' +
    markup +
    '</div>' +
    '<script id="' +
    stateScriptId +
    '" type="application/json">' +
    serializedState +
    '</script>' +
    '<script src="/admin/live-feed-admin.js" defer></script></body></html>'
  );
}

/**
 * Escapes state for safe embedding in a non-executable JSON script element.
 */
export function serializeInitialState(snapshot: LiveFeedDashboardSnapshot): string {
  return JSON.stringify(snapshot)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export const liveFeedAdminRootId = rootId;
export const liveFeedAdminStateScriptId = stateScriptId;
