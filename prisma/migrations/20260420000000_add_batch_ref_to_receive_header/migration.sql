-- Add batch_ref to receive_header for grouping mixed-type receives
ALTER TABLE inventory.receive_header
  ADD COLUMN IF NOT EXISTS batch_ref VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_receive_header_batch_ref
  ON inventory.receive_header (batch_ref);
