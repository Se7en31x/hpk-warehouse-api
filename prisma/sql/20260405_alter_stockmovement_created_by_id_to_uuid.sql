BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'inventory'
          AND table_name = 'stocks_movement'
          AND column_name = 'created_by_id'
          AND udt_name <> 'uuid'
    ) THEN
        ALTER TABLE inventory.stocks_movement
            ALTER COLUMN created_by_id TYPE uuid
            USING NULL::uuid;
    END IF;
END $$;

COMMIT;
