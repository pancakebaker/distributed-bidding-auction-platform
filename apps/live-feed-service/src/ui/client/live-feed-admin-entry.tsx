/**
 * Browser hydration entrypoint for the live-feed operations dashboard.
 */
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { LiveFeedAdminApp } from '../components/live-feed-admin-app.js';
import type { LiveFeedDashboardSnapshot } from '../../application/diagnostics/get-live-feed-dashboard.js';
import { liveFeedAdminRootId, liveFeedAdminStateScriptId } from '../server/render-live-feed-admin.js';

const root = document.getElementById(liveFeedAdminRootId);
const stateElement = document.getElementById(liveFeedAdminStateScriptId);

if (!root || !stateElement) {
  throw new Error('Live-feed admin hydration state is missing.');
}

const initialState = JSON.parse(stateElement.textContent ?? '') as LiveFeedDashboardSnapshot;
hydrateRoot(root, <LiveFeedAdminApp initialState={initialState} />);
