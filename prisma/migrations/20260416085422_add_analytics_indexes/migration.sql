-- Migration: add_analytics_indexes
-- Safe: index-only additions, no DROP / ALTER TABLE / data changes.
-- All tables are in the "inventory" schema (Supabase multi-schema setup).

-- ── item_lots ────────────────────────────────────────────────────────────────
-- Speeds up the deleted_at IS NULL filter present in every analytics query.
CREATE INDEX IF NOT EXISTS "idx_item_lots_deleted_at"
  ON "inventory"."item_lots" ("deleted_at");

-- Speeds up expiry-date range scans (near-expiry counts, expiring-lots list).
CREATE INDEX IF NOT EXISTS "idx_item_lots_expired_at"
  ON "inventory"."item_lots" ("expired_at");

-- Composite index for the combined WHERE deleted_at IS NULL AND expired_at <= ?
-- used by getLotHealth and getExpiryStats.
CREATE INDEX IF NOT EXISTS "idx_item_lots_deleted_expired"
  ON "inventory"."item_lots" ("deleted_at", "expired_at");

-- Composite index for the low-stock JOIN: lot.item_id + lot.quantity < item.min_stock
CREATE INDEX IF NOT EXISTS "idx_item_lots_item_qty"
  ON "inventory"."item_lots" ("item_id", "quantity");

-- ── items ────────────────────────────────────────────────────────────────────
-- Speeds up getLowStockStats WHERE deleted_at IS NULL AND min_stock > 0
CREATE INDEX IF NOT EXISTS "idx_items_deleted_at"
  ON "inventory"."items" ("deleted_at");

-- ── requisition_header ───────────────────────────────────────────────────────
-- Speeds up 90-day time-series queries and getTopItems date-range filter.
CREATE INDEX IF NOT EXISTS "idx_req_header_created_at"
  ON "inventory"."requisition_header" ("created_at");

-- ── receive_header ───────────────────────────────────────────────────────────
-- Speeds up getStockInMonthly WHERE receive_date >= ? AND receive_date < ?
CREATE INDEX IF NOT EXISTS "idx_receive_header_date"
  ON "inventory"."receive_header" ("receive_date");
