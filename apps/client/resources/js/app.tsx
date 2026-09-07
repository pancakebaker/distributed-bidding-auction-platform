/**
 * Blade/Vite entrypoint for the public auction React application.
 */
import '../css/app.css';

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuctionApp } from './app/AuctionApp';

export { AuctionApp };

const root = document.getElementById('app');

if (root) {
    createRoot(root).render(
        <StrictMode>
            <AuctionApp />
        </StrictMode>,
    );
}
