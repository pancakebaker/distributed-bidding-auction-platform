# Auction Operations Portal

This is the operations-facing .NET subsystem of the [Distributed Bidding Auction Platform](../../README.md). It is a separate event consumer and projection, not an administrative write API for auction state.

The portal is an independent ASP.NET Core Blazor consumer of the existing `auction.events` exchange. It owns the `auction_activity` projection in the separate `auction_operations` PostgreSQL database and does not update authoritative auction state.

It consumes through the dedicated durable `auction-operations.activity` queue, bound to `auction.bid.accepted`, `auction.closed`, and `auction.winner.selected`. Invalid messages are dead-lettered through `auction-operations.dead-letter` / `auction-operations.activity.dlq`; transient failures are requeued up to the configured limit.

`event_id` is the database-enforced idempotency key. Aggregate versions are observational metadata only: `AuctionClosed` and `WinnerSelected` may both persist at version 16 when their event IDs differ.

On a fresh PostgreSQL volume, the repository initialization creates `auction_operations`. If using an existing volume created before the portal was added, confirm it does not already exist and create it once with an idempotent administrative setup; do not destroy the volume just to rerun initialization:

```sql
CREATE DATABASE auction_operations;
```

## Authentication boundary

Laravel remains the username/password and administrator authority. The protected Laravel route `/admin/auction-operations` renders a one-time auto-submitting POST handoff to `/auth/handoff`; it never places the JWT in browser storage or a long-lived URL. Laravel signs the short-lived RS256 token with the existing Live Feed private key. The portal reads only the corresponding public key from `../live-feed-service/config/live-feed-admin-public.pem` and requires the exact issuer `auction-client`, audience `auction-operations-portal`, administrator role, `access-auction-operations` permission, expiry, and JTI.

After validation, the portal stores only minimized identity claims in its own short-lived HttpOnly cookie (`auction_operations_auth`). Logout clears that cookie and returns to the configured Laravel admin URL. The configured Laravel base URL is deployment metadata only; logout does not accept a user-controlled redirect. The current in-memory JTI replay guard is intentionally single-instance; a multi-instance deployment must move consumed-JTI storage to a shared store before scaling out. Laravel remains the only username/password authority.

## Live activity

The protected `/activity/live` page uses the authenticated `/hubs/activity` ASP.NET Core SignalR hub for best-effort server-to-browser notifications. The RabbitMQ consumer validates and persists an event before publishing a safe `ActivityNotification` projection; only then is the RabbitMQ message acknowledged. A transient SignalR failure is logged and does not undo the durable `auction_activity` row or requeue an already-persisted event. The browser client runtime is vendored at `wwwroot/lib/signalr.min.js` from `@microsoft/signalr` 10.0.0 so local development does not depend on a CDN.

The page loads at most 100 recent rows from PostgreSQL on startup and after SignalR reconnect. Client state is bounded and deduplicated by `EventId`, so reconnect reconciliation does not duplicate rows. `AggregateVersion` is not a deduplication key: `AuctionClosed` and `WinnerSelected` at the same version remain separate when their event IDs differ. The current live fan-out assumes a single portal instance; distributed live fan-out is outside the current deployment design.

## Activity history

The protected `/activity/history` page queries the portal-owned `auction_activity` projection. It supports UTC `from`/`to` timestamps, exact aggregate ID, known event type, page number, and page size (`25`, `50`, or `100`). The maximum range is 31 days; `From` must not be later than `To`. Filter and pagination state is preserved in the URL, for example `/activity/history?from=...&to=...&eventType=BidAccepted&page=2`.

History uses server-side `AsNoTracking` projection, database-side filtering, and offset pagination. Results are ordered deterministically by `occurred_at_utc DESC, id DESC`, with same-version sibling events retained independently. The existing occurred-time, aggregate-ID, and event-type indexes support the bounded query shapes; no additional migration was needed. PostgreSQL remains the durable source of truth, and history does not read or mutate Bidding Service state.

## PDF activity reports

The protected `GET /activity/report.pdf` endpoint and the **Download PDF** action on `/activity/history` generate a synchronous report from the same UTC filters: `from`, `to`, exact aggregate ID, and the three known event types. Reports use inclusive boundaries, the shared 31-day maximum range, chronological `occurred_at_utc ASC, id ASC` ordering, and reject matches above 5,000 rows rather than silently truncating them. The endpoint returns an attachment with a date-derived filename and does not expose raw event payloads.

Report generation uses QuestPDF `2026.8.0` under its Community License for this learning/demo deployment. The Community License is subject to QuestPDF eligibility rules; a production deployment that does not qualify must select the appropriate paid license before use. PdfSharpCore was not retained because its transitive ImageSharp version produced known vulnerability advisories during restore.

The report service performs the count, grouped summary, and bounded projected row query in PostgreSQL with cancellation propagation. PDF generation uses one bounded in-memory document/response buffer because the selected library generates synchronously; the 5,000-row cap prevents unbounded allocations and avoids silently incomplete reports. Large byte arrays can land on the .NET Large Object Heap and repeated reports can increase GC pressure, so bounded rows and avoiding duplicate buffers are deliberate. Direct streaming or pooling is deferred until profiling demonstrates a need.

Report requests require `AuctionOperationsAdmin` and are limited to five requests per authenticated user per minute through ASP.NET Core fixed-window rate limiting. SignalR traffic is not rate limited. PostgreSQL remains authoritative for the operations projection; report generation never contacts the Bidding Service, RabbitMQ, Node Live Feed, or Redis.

## Observability

The portal uses the `AuctionOperationsPortal` `ActivitySource` and meter. OpenTelemetry instrumentation covers ASP.NET Core, HttpClient, and EF Core when `Observability:Enabled` is true. OTLP and console exporters are both opt-in; normal local startup does not require a collector. Configure `Observability:ServiceName`, `ServiceVersion`, `OtlpEndpoint`, and `UseConsoleExporter` in deployment configuration. Exporter failures do not become an application startup dependency.

The OpenTelemetry packages use version `1.18.0`. EF Core instrumentation is intentionally `1.13.0-beta.1`: no stable package compatible with the repository's .NET 10 / EF Core 10 target is currently available. It resolves against the OpenTelemetry 1.18 API without version-skew warnings, and the current NuGet advisory audit is clean.

Custom spans cover RabbitMQ event processing, activity persistence, SignalR publication, history queries, report queries/rendering, and authentication handoff validation. Existing RabbitMQ `messageId`, `type`, `correlationId`, and envelope correlation semantics are preserved. The publisher does not currently emit W3C trace headers, so consumer spans are created at the portal boundary and retain the existing correlation ID as a span/log field; no event payload or routing-key change is required.

The bounded metrics are `portal.events.processed`, `portal.events.duplicate`, `portal.events.rejected`, `portal.events.transient_failures`, `portal.signalr.publications`, `portal.signalr.publish_failures`, `portal.reports.generated`, `portal.reports.rejected`, plus duration histograms for event processing, history queries, and report generation and a report row-count histogram. Metric labels are restricted to bounded values such as known event type or rejection reason; event IDs, correlation IDs, auction IDs, user IDs, cookies, JWTs, and report contents are not metric dimensions.

`/health` anonymously returns only aggregate status for PostgreSQL and RabbitMQ; it does not return connection strings or dependency exception details. Redis was deliberately deferred: history and report workloads are bounded, PostgreSQL is authoritative, and a cache would add invalidation/staleness complexity without a demonstrated need. Structured logs include relevant event, correlation, trace, and span context without secrets or raw payloads.

## Runtime and performance engineering

The isolated `apps/auction-operations-portal.Benchmarks` project uses BenchmarkDotNet `0.15.8` (MIT) with `[MemoryDiagnoser]`. Run representative benchmarks manually with:

```powershell
dotnet run -c Release --project apps/auction-operations-portal.Benchmarks
```

The benchmark cases cover real in-process boundaries: `IntegrationEventEnvelope` JSON deserialization for `BidAccepted`, `AuctionClosed`, and `WinnerSelected`; envelope-to-`AuctionActivity` and activity-to-`ActivityNotification` mapping; bounded `LiveActivityState` merge with duplicate-heavy input; and report-row preparation for 100, 1,000, and 5,000 rows. Network, PostgreSQL, RabbitMQ, and browser rendering latency are intentionally not represented as microbenchmark results. BenchmarkDotNet output is machine-dependent and observational; it is not a CI pass/fail threshold.

The portal is predominantly I/O-bound: EF Core, RabbitMQ, and SignalR use asynchronous APIs and cancellation tokens. QuestPDF rendering is synchronous and CPU-bound, but reports are bounded at 5,000 rows; it is not moved to `Task.Run` because that would consume a thread-pool worker without improving the underlying renderer. No `.Result`, `.Wait()`, fire-and-forget task, or unbounded `Task.WhenAll` path was found. `Task` remains preferable to broad `ValueTask` adoption because these operations are asynchronous I/O or genuinely asynchronous work rather than a measured synchronous-completion hot path.

The managed heap is collected in generations: short-lived ephemeral allocations normally die in Gen0, survivors move through Gen1 toward Gen2, and large objects use the Large Object Heap (LOH). A PDF byte buffer can enter the LOH when its runtime size reaches the platform's large-object threshold (commonly about 85 KB; the actual boundary is an implementation detail), but the repository does not invent a size claim without measuring representative reports. The 5,000-row bound limits allocation pressure; the current synchronous renderer uses a bounded render stream plus the final response byte array, without Base64 or additional application-level full-document copies. Repeated concurrent large reports could still increase GC and LOH pressure. Avoiding duplicate buffers is more valuable here than speculative pooling.

Server GC is a deployment/runtime choice and is not forced by the current demo; the short benchmark run used concurrent Workstation GC on the development machine. Server GC may be appropriate for a dedicated high-throughput server process, but it should be selected and measured with the deployment profile rather than assumed to improve every bounded portal workload.

`Span<T>`, `Memory<T>`, and `ArrayPool<T>` were reviewed and deferred. The consumer uses the message span only at the UTF-8 decode boundary, report rows are bounded, and no repeated large temporary-array allocation has been measured that would justify lifetime complexity or pooling. `Span<T>` cannot cross the async persistence boundaries; `Memory<T>` is unnecessary because no buffer must survive such a boundary. If profiling later shows sustained large temporary buffers, the benchmark project should precede any production pooling change.

The current explicit DI map is intentional: singleton `AuctionActivityConsumer`, `PortalReplayProtection`, `LaravelTokenValidator`, `IActivityNotificationPublisher`, `IntegrationEventMapper`, and `RabbitMqTopology`; scoped `AuctionOperationsDbContext`, `IActivityPersistence`, `IRecentActivityQuery`, `IActivityHistoryQueryService`, and `IActivityReportService`; framework-managed transient hub/component instances. The consumer resolves scoped persistence through `IServiceScopeFactory`, so it has no captive `DbContext`. Assembly scanning/Scrutor was not added because the explicit registrations make lifetime and security boundaries visible.

For local runtime diagnostics, install the .NET diagnostic tools if needed and inspect a running process with:

```powershell
dotnet-counters monitor --process-id <pid> System.Runtime
dotnet-counters monitor --process-id <pid> --counters System.Runtime,Microsoft.AspNetCore.Hosting
dotnet-trace collect --process-id <pid> --providers Microsoft-DotNETCore-SampleProfiler
dotnet-gcdump collect --process-id <pid> -o portal.gcdump
```

These are development procedures only. Useful signals include GC heap size, allocation rate, Gen0/1/2 collections, thread-pool queue length, and CPU. Do not commit diagnostic dumps or benchmark artifacts.

## Configuration and local run

The checked-in `appsettings.json` files contain safe local development values only. The normal local configuration uses PostgreSQL at `127.0.0.1:55432`, RabbitMQ at `localhost:5672`, exchange `auction.events`, queue `auction-operations.activity`, dead-letter exchange `auction-operations.dead-letter`, and dead-letter queue `auction-operations.activity.dlq`. Laravel authentication uses issuer `auction-client`, audience `auction-operations-portal`, permission `access-auction-operations`, and the public key copied to `apps/live-feed-service/config/live-feed-admin-public.pem`; Laravel retains the private key under its storage directory.

After the root infrastructure, Laravel, and Live Feed setup is complete, apply the portal migration and run it separately:

```powershell
dotnet ef database update --project apps/auction-operations-portal --startup-project apps/auction-operations-portal
dotnet run --no-restore --project apps/auction-operations-portal --urls http://localhost:5099
```

The existing `scripts/start-demo.ps1` starts the Bidding Service, Outbox Publisher, Auction Scheduler, Live Feed, Laravel, Vite/client, and this portal process. It launches the portal with `dotnet run --no-restore`, skips startup when port `5099` is already listening, and waits for `/health` to become ready. Enter through Laravel at `http://localhost:8000/admin`; direct operational routes are `/activity/live`, `/activity/history`, and `/health` on port `5099`.
