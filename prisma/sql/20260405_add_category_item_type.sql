BEGIN;

ALTER TABLE inventory.categories
    ADD COLUMN IF NOT EXISTS item_type varchar(20) DEFAULT 'CONSUMABLE';

UPDATE inventory.categories
SET item_type = 'MED_ASSET'
WHERE UPPER(COALESCE(item_type, '')) = 'ASSET';

UPDATE inventory.categories
SET item_type = COALESCE(item_type, 'CONSUMABLE')
WHERE item_type IS NULL;

UPDATE inventory.categories
SET item_type = 'CONSUMABLE'
WHERE UPPER(item_type) NOT IN ('CONSUMABLE', 'REUSABLE', 'MED_ASSET');

ALTER TABLE inventory.categories
    ALTER COLUMN item_type SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'categories_item_type_chk'
    ) THEN
        ALTER TABLE inventory.categories
            ADD CONSTRAINT categories_item_type_chk
            CHECK (UPPER(item_type) IN ('CONSUMABLE', 'REUSABLE', 'MED_ASSET'));
    END IF;
END $$;

COMMIT;
