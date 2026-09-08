-- Durable but non-authoritative operational history for the Node live-feed service.
CREATE TABLE IF NOT EXISTS live_feed_history (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  auction_id TEXT NULL,
  event_type TEXT NOT NULL,
  aggregate_version BIGINT NULL,
  correlation_id TEXT NULL,
  occurred_at TIMESTAMPTZ NULL,
  processed_at TIMESTAMPTZ NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'stale', 'ignored', 'error'))
);

CREATE INDEX IF NOT EXISTS ix_live_feed_history_processed_at
  ON live_feed_history (processed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_live_feed_history_auction_processed_at
  ON live_feed_history (auction_id, processed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_live_feed_history_event_type_processed_at
  ON live_feed_history (event_type, processed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_live_feed_history_outcome_processed_at
  ON live_feed_history (outcome, processed_at DESC, id DESC);