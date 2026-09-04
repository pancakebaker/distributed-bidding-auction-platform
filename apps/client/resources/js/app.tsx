import '../css/app.css';

import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
    return (
        <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
            <section className="mx-auto flex max-w-5xl flex-col gap-6">
                <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">Functional distributed-system demo</p>
                <div className="space-y-4">
                    <h1 className="text-4xl font-semibold sm:text-5xl">Distributed Bidding Auction Platform</h1>
                    <p className="max-w-3xl text-lg leading-8 text-zinc-300">
                        Laravel and React are booting. Auction UI, bidding workflows, and live updates are planned for later phases.
                    </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
                        <h2 className="font-semibold text-zinc-50">Client</h2>
                        <p className="mt-2 text-sm text-zinc-400">Laravel + React + TypeScript + Vite</p>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
                        <h2 className="font-semibold text-zinc-50">Bidding API</h2>
                        <p className="mt-2 text-sm text-zinc-400">ASP.NET Core authoritative service</p>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
                        <h2 className="font-semibold text-zinc-50">Live Feed</h2>
                        <p className="mt-2 text-sm text-zinc-400">Socket.IO fan-out service</p>
                    </div>
                </div>
            </section>
        </main>
    );
}

const root = document.getElementById('app');

if (root) {
    createRoot(root).render(<App />);
}
