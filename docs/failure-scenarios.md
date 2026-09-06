# Failure Scenarios

This document summarizes the demo's important correctness and recovery scenarios.

| Scenario | Expected behavior | Protection mechanism |
| --- | --- | --- |
| Simultaneous same-value bids | Only one bid is accepted; the loser is rejected after revalidation. | EF Core optimistic concurrency on `Auction.Version`, PostgreSQL transaction rollback, bounded retry. |
| Simultaneous increasing bids | Bids serialize safely; final state reflects the highest valid accepted bid sequence. | PostgreSQL update condition includes expected version; each retry re-reads authoritative state. |
| Stale bid after concurrency conflict | A bid that was valid against stale UI but below the new minimum is rejected. | Full server-side bid-rule revalidation after each concurrency conflict. |
| RabbitMQ outage during accepted bid | Bid, auction state, and `BidAccepted` outbox row commit; event remains unpublished until RabbitMQ returns. | Transactional outbox decouples command commit from broker availability. |
| Duplicate RabbitMQ event | Event is ACKed but not rebroadcast. | Live Feed Redis idempotency key `live-feed:processed-event:{eventId}`. |
| Stale lower `aggregateVersion` event | Event is ACKed/ignored and does not move clients backward. | Atomic Redis script compares incoming version with `live-feed:auction-version:{auctionId}`. |
| Same-version `AuctionClosed` + `WinnerSelected` | Both events are broadcast when their `eventId` values are distinct. | `eventId` provides uniqueness; `aggregateVersion` represents aggregate state, not per-event sequence. |
| Live Feed outage | REST auction pages and bid submissions still work; missed live state reconciles on refresh. | REST/Bidding Service remains authoritative; Socket.IO is projection only. |
| RabbitMQ outage during auction close | Scheduler closes auction and writes lifecycle outbox rows; publisher sends them after broker recovery. | Scheduler writes PostgreSQL/outbox transaction only, never direct RabbitMQ publish. |
| Competing scheduler instances | Auction closes once; version increments once; no duplicate lifecycle events. | PostgreSQL `FOR UPDATE SKIP LOCKED` row claiming plus status/version checks. |
| Bid after close | Bid is rejected and no `Bid`/`BidAccepted` row is created. | Bidding Service re-reads server-authoritative closed state and validates server UTC/status. |

## Reliability Notes

- Publication is at-least-once, not exactly-once.
- A crash after RabbitMQ confirm but before `PublishedAtUtc` is stored can produce duplicate delivery.
- Consumers must remain idempotent using `eventId`.
- Redis idempotency keys are demo-level TTL records, not a permanent event ledger.
- More mature retry backoff and poison-message operations are production work.