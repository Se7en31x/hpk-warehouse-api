SELECT
  i.id,
  i.code,
  i.name,
  i.description,
  i.category_id,
  c.name AS category_name,
  i.unit_id,
  u.name AS unit_name,
  i.warehouse_id,
  w.name AS warehouse_name,
  i.current_stock,
  i.min_stock,
  i.sell_price,
  i.status,
  i.image_url,
  i.created_at,
  i.updated_at,
  i.deleted_at
FROM
  (
    (
      (
        inventory.items i
        LEFT JOIN inventory.categories c ON ((i.category_id = c.id))
      )
      LEFT JOIN inventory.units u ON ((i.unit_id = u.id))
    )
    LEFT JOIN inventory.warehouses w ON ((i.warehouse_id = w.id))
  );