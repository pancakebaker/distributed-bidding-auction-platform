# Bidding Auction Client

This application is the browser client for the **Distributed Bidding Auction Platform**.

It is built with **Laravel**, **Vite**, **React**, and **TypeScript** and provides the user-facing auction experience. The client communicates with the platform services to display auction state, place bids, and receive live auction updates.

## What the Client Does

The client is responsible for:

- Displaying available auction information and the current bid state
- Allowing users to submit bids to the bidding service
- Receiving live auction updates from the live-feed service
- Updating the UI when newer aggregate versions are received
- Preventing the browser from regressing to older auction state
- Providing the demo/live-auction experience for the platform

The client does not own auction business rules. Bid validation, concurrency control, persistence, event publishing, and auction scheduling are handled by the backend services.

## Tech Stack

- Laravel
- React
- TypeScript
- Vite
- Vitest

## Prerequisites

Before starting the client, make sure you have:

- PHP and Composer
- Node.js and npm
- The required backend services running if you want to use the full live-auction workflow

For the complete platform experience, the bidding service and live-feed service should be available. RabbitMQ and Redis are also used by the platform's event-driven infrastructure.

## Getting Started

From the client directory:

```bash
cd apps/client
```

Install PHP dependencies:

```bash
composer install
```

Create the local environment file if it does not already exist:

```bash
cp .env.example .env
```

On Windows PowerShell, you can use:

```powershell
Copy-Item .env.example .env
```

Generate the Laravel application key:

```bash
php artisan key:generate
```

Install JavaScript dependencies:

```bash
npm install
```

## Start the Client

Start Laravel:

```bash
php artisan serve
```

In another terminal, start the Vite development server:

```bash
npm run dev
```

Then open the local Laravel URL shown by `php artisan serve`, typically:

```text
http://127.0.0.1:8000
```

## Production Build

Build the frontend assets with:

```bash
npm run build
```

## Tests and Quality Checks

Run the client test suite with:

```bash
npm test
```

Run TypeScript validation with:

```bash
npm run typecheck
```

Run ESLint with:

```bash
npm run lint
```

Check formatting with:

```bash
npm run format:check
```

## Static Analysis

The client participates in the repository-wide JavaScript/TypeScript quality gates.

The project uses:

- ESLint
- TypeScript-aware linting
- React and React Hooks rules
- JSX accessibility checks
- Prettier
- JSDoc documentation enforcement for the public/exported source surface

These checks also run in CI.

## Related Services

The client is part of a larger distributed auction platform that includes:

- **Bidding Service** — validates and accepts bids and owns bid state transitions
- **Live Feed Service** — consumes auction events and broadcasts live updates to connected clients
- **Auction Operations Portal** — authenticated Blazor operations UI for live activity, history, and PDF reports; see [portal documentation](../auction-operations-portal/README.md)
- **Auction Scheduler** — handles time-based auction lifecycle actions
- **Outbox Publisher** — publishes persisted domain events to the messaging infrastructure

Laravel remains the identity authority. The protected `/admin/auction-operations` route performs the short-lived RS256 handoff to the portal; the client does not store the portal JWT. See the [repository README](../../README.md) for the final architecture, local infrastructure setup, and end-to-end demo instructions.

## License

This project is licensed under the MIT License.
