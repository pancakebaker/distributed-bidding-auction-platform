# Demo Walkthrough

This is a 3-5 minute technical demo script for interviews or portfolio reviews.

## Setup

From the repository root:

```powershell
scripts\start-infrastructure.ps1
scripts\reset-demo.ps1
scripts\start-demo.ps1
```

Open two browser windows at `http://localhost:8000/auctions`.

## Walkthrough

1. **Start with the visual story.**
   Open the MacBook Pro auction in two browser windows and say: "Two users are connected to the same auction." Keep both current bid panels and live indicators visible.

2. **Place Alice's bid.**
   Alice receives an immediate REST success response from the .NET Bidding Service. The audience should see the command succeed before you explain the internals.

3. **Show Bob's browser update.**
   Point to the second browser updating through `bid:accepted`: "The bid was committed atomically with an outbox event, published through RabbitMQ, consumed by the Live Feed Service, then fanned out through Redis and Socket.IO."

4. **Briefly show the architecture.**
   Connect the visible UI behavior to the Laravel/React client, .NET Bidding Service, PostgreSQL, transactional outbox, Outbox Publisher, RabbitMQ, Live Feed Service, Redis, Socket.IO, Auction Scheduler, and the separate Auction Operations Portal projection.

5. **Place Bob's higher bid.**
   Show the current bid, highest bidder, auction version, and bid history updating. Mention that simultaneous bid races are handled by PostgreSQL optimistic concurrency on `Auction.Version`.

6. **Explain `aggregateVersion`.**
   It is the resulting auction version for ordering and stale-event protection. It is not a unique event sequence number; `eventId` is the event identity.

7. **Let a short auction expire.**
   Open the Short Demo Auction in both clients. Optionally place a bid before it closes. Wait for server UTC to pass `EndTimeUtc`.

8. **Observe automatic closure.**
   The Auction Scheduler closes the auction in PostgreSQL, increments `Auction.Version` once, and writes `AuctionClosed` plus `WinnerSelected` when a winning bid exists.

9. **Watch real-time lifecycle updates.**
   Both clients transition to Closed without refresh. The bid form disables. If there is a winner, the UI shows the winner; if no bids exist, it shows that no bids were placed.

10. **Briefly show failure resilience.**
    Explain that RabbitMQ can be down while bids or closures commit because the API/scheduler only depend on PostgreSQL. The publisher retries later. Duplicate delivery is expected, and consumers dedupe by `eventId`.

11. **Optionally show operations.**
    Start the portal separately with `dotnet run --project apps/auction-operations-portal --urls http://localhost:5099`, then enter through Laravel at `http://localhost:8000/admin/auction-operations`. Show `/activity/live` for authenticated SignalR activity, `/activity/history` for UTC-filtered PostgreSQL history, and the Download PDF action. Explain that the portal is a separate operational projection and does not mutate auction state.

## Useful URLs

- Client: `http://localhost:8000/auctions`
- Bidding API Swagger: `http://localhost:5000/swagger`
- Live Feed health: `http://localhost:3001/health`
- Operations Portal handoff: `http://localhost:8000/admin/auction-operations`
- Operations Portal live activity: `http://localhost:5099/activity/live`
- Operations Portal history: `http://localhost:5099/activity/history`
- Operations Portal health: `http://localhost:5099/health`
- RabbitMQ management: `http://localhost:15672`

## Closing Talking Points

- PostgreSQL is authoritative for bid and auction state.
- RabbitMQ is durable event transport, not the command path.
- Redis powers live fan-out and demo-level dedupe/version state, not auction authority.
- The browser is a projection. REST refresh reconciles missed live events.
- This is a functional architecture demo, not a production auction platform.
