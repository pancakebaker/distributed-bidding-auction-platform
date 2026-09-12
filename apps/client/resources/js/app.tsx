/**
 * Blade/Vite entrypoint for the public auction React application.
 */
import '../css/app.css';

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuctionApp } from './app/AuctionApp';

/** Minimal server-rendered authentication state safe for public browser code. */
export type AuthBootstrap = {
    authenticated: boolean;
    displayName: string | null;
    subjectId: string | null;
    isAdmin: boolean;
};

declare global {
    interface Window {
        __AUTH_BOOTSTRAP__?: AuthBootstrap;
    }
}

export { AuctionApp };

const root = document.getElementById('app');

if (root) {
    createRoot(root).render(
        <StrictMode>
            <AuctionApp />
        </StrictMode>,
    );
}
