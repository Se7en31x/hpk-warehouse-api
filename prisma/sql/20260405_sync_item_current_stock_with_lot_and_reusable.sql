BEGIN;

-- Cleanup legacy lot-only trigger/function if they still exist.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT t.tgname
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'inventory'
          AND c.relname = 'item_lots'
          AND p.proname = 'update_current_stock_from_lot'
          AND NOT t.tgisinternal
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON inventory.item_lots', r.tgname);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS inventory.update_current_stock_from_lot();

-- Recalculate current_stock for one item_id based on category-driven item_type.
CREATE OR REPLACE FUNCTION inventory.fn_refresh_item_current_stock(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_item_type varchar(20);
    v_current_stock integer := 0;
BEGIN
    IF p_item_id IS NULL THEN
        RETURN;
    END IF;

    SELECT UPPER(COALESCE(c.item_type, i.type, 'CONSUMABLE'))
    INTO v_item_type
    FROM inventory.items i
    LEFT JOIN inventory.categories c ON c.id = i.category_id
    WHERE i.id = p_item_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_item_type = 'REUSABLE' THEN
        SELECT COUNT(*)::integer
        INTO v_current_stock
        FROM inventory.reusable_item_units ru
        WHERE ru.item_id = p_item_id
          AND ru.deleted_at IS NULL
          AND UPPER(COALESCE(ru.status, 'AVAILABLE')) <> 'DISPOSED';

    ELSIF v_item_type = 'MED_ASSET' THEN
        -- Medical assets are tracked in registry, not current_stock quantity.
        v_current_stock := 0;

    ELSE
        -- Consumables are stock-on-hand from active lots.
        SELECT COALESCE(SUM(l.quantity), 0)::integer
        INTO v_current_stock
        FROM inventory.item_lots l
        WHERE l.item_id = p_item_id
          AND l.status = 'ACTIVE'
          AND l.quantity > 0
          AND l.deleted_at IS NULL;
    END IF;

    UPDATE inventory.items
    SET current_stock = v_current_stock,
        updated_at = now()
    WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION inventory.trg_item_lots_refresh_current_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM inventory.fn_refresh_item_current_stock(OLD.item_id);
        RETURN OLD;
    END IF;

    PERFORM inventory.fn_refresh_item_current_stock(NEW.item_id);

    IF TG_OP = 'UPDATE' AND OLD.item_id IS DISTINCT FROM NEW.item_id THEN
        PERFORM inventory.fn_refresh_item_current_stock(OLD.item_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_item_lots_refresh_current_stock ON inventory.item_lots;
CREATE TRIGGER trg_item_lots_refresh_current_stock
AFTER INSERT OR UPDATE OR DELETE
ON inventory.item_lots
FOR EACH ROW
EXECUTE FUNCTION inventory.trg_item_lots_refresh_current_stock();

CREATE OR REPLACE FUNCTION inventory.trg_reusable_units_refresh_current_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM inventory.fn_refresh_item_current_stock(OLD.item_id);
        RETURN OLD;
    END IF;

    PERFORM inventory.fn_refresh_item_current_stock(NEW.item_id);

    IF TG_OP = 'UPDATE' AND OLD.item_id IS DISTINCT FROM NEW.item_id THEN
        PERFORM inventory.fn_refresh_item_current_stock(OLD.item_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reusable_units_refresh_current_stock ON inventory.reusable_item_units;
CREATE TRIGGER trg_reusable_units_refresh_current_stock
AFTER INSERT OR UPDATE OR DELETE
ON inventory.reusable_item_units
FOR EACH ROW
EXECUTE FUNCTION inventory.trg_reusable_units_refresh_current_stock();

CREATE OR REPLACE FUNCTION inventory.trg_items_refresh_current_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM inventory.fn_refresh_item_current_stock(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_refresh_current_stock ON inventory.items;
CREATE TRIGGER trg_items_refresh_current_stock
AFTER INSERT OR UPDATE OF category_id, type
ON inventory.items
FOR EACH ROW
EXECUTE FUNCTION inventory.trg_items_refresh_current_stock();

-- Backfill all existing items after creating function/trigger.
DO $$
DECLARE
    v_item_id uuid;
BEGIN
    FOR v_item_id IN SELECT id FROM inventory.items LOOP
        PERFORM inventory.fn_refresh_item_current_stock(v_item_id);
    END LOOP;
END $$;

COMMIT;
