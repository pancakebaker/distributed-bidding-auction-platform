# Laravel/React Client Expansion

This directory collects the architecture notes for the expanded Laravel/React client work from Phases 13 through 18.

## Purpose

The client application owns browser presentation and Laravel-managed web concerns:

- public auction presentation
- admin authorization and administration screens
- Laravel-owned CMS pages and FAQs
- audit logging
- asynchronous exports
- notification preferences
- scheduled CMS publication support

It does not own authoritative bidding behavior. The Bidding Service remains responsible for bid acceptance, validation, ordering, aggregate versions, concurrency, current bid state, winner selection, and auction state transitions. The Live Feed Service remains responsible for real-time auction update fan-out.

## Architecture Map

```text
Browser
├── Laravel/React Client
│   ├── Public Auction UI
│   ├── Admin
│   ├── CMS
│   ├── Audit
│   ├── Exports
│   └── Preferences
│
├── Bidding Service
│   └── authoritative bid processing
│
└── Live Feed Service
    └── real-time auction updates
```

The client keeps the existing architecture:

```text
Laravel route
  ↓
Blade host
  ↓
React/Vite entrypoint
```

There is no Inertia, React Router, Redux, Zustand, or React Query layer in the current client. Laravel owns HTTP routing and authorization; React renders inside the resolved page.

## Documentation Index

- [Admin architecture](admin-architecture.md): admin Gate, protected routes, dashboard, users, and Blade bootstrap data.
- [CMS architecture](cms-architecture.md): pages, FAQs, Eloquent relationships, Form Requests, public CMS routes, and CMS security.
- [Services, events, cache, and audit trail](services-events-cache.md): service container bindings, CMS cache, events/listeners, audit logging, and aggregate reporting.
- [Queues, jobs, scheduling, notifications, and exports](queues-jobs-scheduling.md): scheduled publishing, queued jobs, database notifications, export generation, queue runtime, and scheduler runtime.
- [React and Vite architecture](react-vite-architecture.md): Strict Mode, lifecycle, state design, data-fetching boundaries, routing decision, and Vite 8 multi-entry build behavior.

## Topic Coverage

Laravel topics are represented by real client-owned behavior:

- authentication-aware admin authorization through `auth` and the `access-admin` Gate
- migrations for users, CMS content, audit logs, notification preferences, exports, and notifications
- Eloquent models, casts, relationships, factories, scopes, and eager loading
- Form Requests for CMS and preference validation
- service container bindings in `App\Providers\CmsServiceProvider`
- constructor injection for cache/export boundaries
- events and listeners for CMS writes, cache invalidation, audit logging, and queued notifications
- database-backed queues, jobs, scheduler declarations, retries, and failed-job semantics
- filesystem abstraction for private export storage

React/Vite topics are covered without adding unnecessary libraries:

- multiple React roots mounted from Blade hosts
- Strict Mode around public auction, admin, and public CMS roots
- functional lifecycle cleanup for timers, browser listeners, and Socket.IO subscriptions
- local and lifted state for forms and pending UI
- shallow prop flow instead of premature Context
- a custom pagination hook where shared derivation exists
- deliberate avoidance of unnecessary memoization and concurrent APIs
- Vite 8 multi-entry build, HMR/Fast Refresh, jsdom Vitest setup, and browser-visible `VITE_*` environment handling


## Local Admin Access

The client includes a minimal Laravel session login/logout flow for manual admin access:

- `GET /login` renders a Blade login form.
- `POST /login` validates email/password with `Auth::attempt`, regenerates the session, and redirects intended users to `/admin`.
- `POST /logout` logs out, invalidates the session, regenerates the CSRF token, and returns to `/login`.

There is no registration, forgot-password, OAuth, or social-auth flow. Admin access still requires the existing server-side `auth` and `can:access-admin` middleware; logging in as a normal user does not grant admin access.

For local manual testing, create an admin with explicit environment values:

```powershell
$env:LOCAL_ADMIN_EMAIL="admin@example.test"
$env:LOCAL_ADMIN_PASSWORD="choose-a-local-password"
$env:LOCAL_ADMIN_NAME="Local Admin"
php artisan db:seed --class=LocalAdminSeeder
```

`LocalAdminSeeder` only runs in the local environment and does not ship a default password.

## Demo CMS Seed Data

Fresh local databases can be populated with deterministic admin/CMS data from `apps/client`:

```powershell
php artisan migrate
php artisan db:seed
```

`db:seed` creates or updates a development demo administrator, four published pages (`about`, `how-it-works`, `terms`, and `privacy`), and six published FAQs. The default demo admin uses `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_NAME`, and `DEMO_ADMIN_PASSWORD` when set, falling back to `admin@example.test`, `Demo Admin`, and `password` for local/demo convenience. Use `LocalAdminSeeder` with explicit `LOCAL_ADMIN_*` values when you want a separately controlled local administrator.

The page and FAQ seeders are idempotent and clear the relevant public CMS cache entries after updating seeded content.

## Admin Navigation

Admin pages still support direct requests and refreshes through Laravel:

```text
/admin/* request
  ↓
Laravel auth + can:access-admin
  ↓
controller
  ↓
Blade bootstrap
  ↓
React admin shell
```

After an authorized admin shell has loaded, ordinary same-origin admin link clicks use the History API and request the same protected Laravel route as JSON. The shell remains mounted, the content area shows a small pending state, and Back/Forward use `popstate` to reload authorized page data. Modified clicks, external links, form posts, and export downloads keep normal browser behavior.

This navigation polish does not replace server authorization. The JSON responses are produced by the same admin routes and middleware as direct page loads.
## Client Verification Commands

Run these from `apps/client` unless noted otherwise:

```powershell
php artisan test
composer test
vendor/bin/pint --test
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
php artisan route:list
php artisan schedule:list
```

The scheduler declaration is not self-executing in production-like environments. A host still needs `php artisan schedule:run` every minute or an appropriate `php artisan schedule:work` process. Queued jobs require a worker such as `php artisan queue:work`.

