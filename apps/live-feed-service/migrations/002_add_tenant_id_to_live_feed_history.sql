-- MT4 backfill for databases created before tenant-aware event history.
ALTER TABLE live_feed_history ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE live_feed_history
SET tenant_id = 'aaaaaaaa-1111-4111-8111-111111111111'
WHERE tenant_id IS NULL;

ALTER TABLE live_feed_history ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_live_feed_history_tenant_processed_at
  ON live_feed_history (tenant_id, processed_at DESC, id DESC);
