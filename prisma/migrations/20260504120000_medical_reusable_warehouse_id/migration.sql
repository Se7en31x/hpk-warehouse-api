-- Optional storage location (คลัง / ตำแหน่งจัดเก็บ) on assets and reusable units
ALTER TABLE "inventory"."medical_assets" ADD COLUMN "warehouse_id" UUID;

ALTER TABLE "inventory"."medical_assets"
ADD CONSTRAINT "fk_medical_assets_warehouse"
FOREIGN KEY ("warehouse_id") REFERENCES "inventory"."warehouses" ("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_medical_assets_warehouse_id" ON "inventory"."medical_assets" ("warehouse_id");

ALTER TABLE "inventory"."reusable_item_units" ADD COLUMN "warehouse_id" UUID;

ALTER TABLE "inventory"."reusable_item_units"
ADD CONSTRAINT "fk_reusable_unit_warehouse"
FOREIGN KEY ("warehouse_id") REFERENCES "inventory"."warehouses" ("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_reusable_units_warehouse_id" ON "inventory"."reusable_item_units" ("warehouse_id");
