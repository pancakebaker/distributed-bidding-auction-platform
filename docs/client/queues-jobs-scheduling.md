# Queues, Jobs, Scheduling, Notifications, and Exports

Phase 16 adds asynchronous Laravel behavior for CMS/admin concerns only. It does not route bidding, bid ordering, auction settlement, Redis bidding state, RabbitMQ bid processing, or live-feed ordering through Laravel queues.

## Queue Architecture

```text
Web Request
   ↓
dispatch job
   ↓
database queue
   ↓
queue worker
   ↓
job handler
```

The client keeps Laravel's database queue driver. This is enough for local development and tests, while still using Laravel's queue abstraction so another queue driver can be introduced later without rewriting job handlers.

Queued work introduced in this phase:

- `PublishScheduledPages`, dispatched by the scheduler command
- `GenerateAuditLogExport`, dispatched when an admin requests an audit-log export
- `PagePublishedNotification`, queued through Laravel Notifications

Jobs carry minimal identifiers, such as export IDs and page notification fields, rather than request payloads or credentials.

## Scheduled Publishing

Scheduled publishing uses one state model:

```text
draft page with published_at <= now()
   ↓
ScheduledPagePublisher
   ↓
status becomes published
   ↓
PagePublished
   ├── cache invalidation
   ├── audit log
   └── queued notifications
```

Eligibility is database-filtered:

```text
status = draft
published_at IS NOT NULL
published_at <= now()
```

Already-published pages are not republished. Future-dated drafts remain drafts until eligible.

The scheduler declaration lives in `routes/console.php`:

```text
cms:publish-scheduled-pages every minute without overlapping
```

The command dispatches `PublishScheduledPages`; the job invokes `ScheduledPagePublisher`.

## Idempotency and Overlap

The publisher scans eligible page IDs and then performs an atomic conditional update for each page:

```text
WHERE id = ?
AND status = draft
AND published_at <= now()
```

Only the worker that updates one row dispatches `PagePublished`. Repeated runs are safe because published rows no longer match the draft eligibility condition. `withoutOverlapping()` reduces duplicate scheduler dispatches on one host; the conditional update is the application-level safety net for overlapping workers.

## Notifications

Notification preferences default to enabled. Users may own a `notification_preferences` row with explicit overrides:

- `cms_publication_updates_enabled`
- `database_notifications_enabled`

The `/account/notifications` route lets an authenticated user view and update only their own preferences. The server derives `user_id`; the browser cannot submit another user's owner ID. Users without a row follow the enabled defaults, so publication notifications are not silently skipped before someone visits the preferences page.

`PagePublishedNotification` uses Laravel's database notification channel and implements `ShouldQueue`. A notification failure does not roll back publication, audit logging, or cache invalidation. Laravel queue retry/failure infrastructure owns notification retry behavior.

## Exports

Admins can request an audit-log export from `/admin/exports` or `/admin/audit-logs/export`.

```text
Admin request
   ↓
exports row: pending
   ↓
GenerateAuditLogExport job
   ↓
CSV stored on private local disk
   ↓
exports row: completed or failed
```

Exports are owner-only for download. The browser receives a download route, not a filesystem path. The controller checks authentication, admin authorization through the route group, owner ID, completed status, and file existence before returning the file through Laravel's filesystem abstraction.

The exporter reads audit rows with `lazyById(100)` to avoid loading an unbounded audit table into memory.

## Failure Semantics

Publication is the durable business action. Notifications are follow-up work and may fail independently.

`GenerateAuditLogExport` uses:

```text
tries = 3
backoff = 60, 300, 900 seconds
```

The job marks an export `processing`, `completed`, or `failed`. When retries are exhausted, Laravel's `failed_jobs` table remains the operational queue history, while the `exports` table gives the application a user-visible failed state.

## Scheduler Runtime

Declaring a scheduled task does not make it run by itself. A production-like host still needs something equivalent to:

```text
php artisan schedule:run
```

called every minute by the host scheduler, or:

```text
php artisan schedule:work
```

in an appropriate long-running development environment.

## Queue Runtime

Queued jobs require a worker such as:

```text
php artisan queue:work
```

A real deployment should supervise that worker so it restarts after failure or deploys. Web requests enqueue long-running work and return quickly instead of generating exports synchronously.

## Security

CSV output is generated server-side from curated audit fields. Raw metadata, request bodies, tokens, password hashes, cookies, API credentials, and file paths are not exported to the browser.

CSV formula injection is mitigated by prefixing user-controlled values that begin with `=`, `+`, `-`, or `@` before writing them to the CSV.

Export files are stored on Laravel's private local disk path under `exports/audit-logs`. Download authorization is server-side and resolves only the stored path for the export row.

## React UI

The admin React app adds an Exports page with:

- export request form
- pending/processing/completed/failed status display
- owner-safe download links
- manual Refresh link

No polling is implemented in this phase. A manual refresh keeps the lifecycle simple and avoids adding timers merely for demonstration. State is used for form pending indicators and controlled notification checkboxes. Refs are unnecessary because there is no interval handle or in-flight guard to track.

Concurrent React features are intentionally deferred. The export and notification screens render small server-provided payloads, so `useDeferredValue`, `startTransition`, or broad memoization would add more complexity than value.
## Phase 17 React/Vite Review

React lifecycle, Strict Mode, routing, data-fetching boundaries, and Vite multi-entry build behavior are documented in [react-vite-architecture.md](react-vite-architecture.md).

