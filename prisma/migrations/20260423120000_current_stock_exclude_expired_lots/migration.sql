-- คำนวณ current_stock ของวัสดุสิ้นเปลืองโดยไม่รวมล็อตที่หมดอายุแล้ว (ยอดสินค้าลดตามล็อตที่หมดอายุ)
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
        v_current_stock := 0;

    ELSE
        SELECT COALESCE(SUM(l.quantity), 0)::integer
        INTO v_current_stock
        FROM inventory.item_lots l
        WHERE l.item_id = p_item_id
          AND l.status = 'ACTIVE'
          AND l.quantity > 0
          AND l.deleted_at IS NULL
          AND (l.expired_at IS NULL OR l.expired_at > now());
    END IF;

    UPDATE inventory.items
    SET current_stock = v_current_stock,
        updated_at = now()
    WHERE id = p_item_id;
END;
$$;

-- รีเฟรชยอดทุกรายการให้สอดคล้องกับเกณฑ์ใหม่
DO $$
DECLARE
    v_item_id uuid;
BEGIN
    FOR v_item_id IN SELECT id FROM inventory.items LOOP
        PERFORM inventory.fn_refresh_item_current_stock(v_item_id);
    END LOOP;
END $$;
