/**
 * Shared presentation pieces for the public auction experience.
 */
import React from 'react';
import type { LiveStatus } from '../../types';
import { formatLiveStatus } from '../utils/auction';
import { navigateTo } from '../utils/navigation';

/**
 * Renders the shared public auction page shell.
 */
export function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="app-shell">
            <header className="topbar">
                <button className="brand" onClick={() => navigateTo('/auctions')} type="button">
                    Distributed Bidding Auction Platform
                </button>
                <span className="demo-badge">Functional demo</span>
            </header>
            {children}
        </main>
    );
}

/**
 * Renders the current live-feed connection status.
 */
export function LiveIndicator({ status }: { status: LiveStatus }) {
    const formatted = formatLiveStatus(status);
    const label = status === 'connected' ? 'Live ' + formatted.toLowerCase() : formatted;

    return <span className={'live-indicator live-' + status}>{label}</span>;
}

/**
 * Renders a public loading or error state message.
 */
export function StateMessage({
    title,
    message,
    tone = 'neutral',
}: {
    title: string;
    message: string;
    tone?: 'neutral' | 'error';
}) {
    return (
        <section className={'state-message ' + tone}>
            <h2>{title}</h2>
            <p>{message}</p>
        </section>
    );
}
