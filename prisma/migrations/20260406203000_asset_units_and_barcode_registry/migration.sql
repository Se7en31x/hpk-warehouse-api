-- Phase A: per-unit instances for medical assets
CREATE TABLE "inventory"."asset_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "unit_no" VARCHAR(50) NOT NULL,
    "serial_no" VARCHAR(100),
    "department_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'READY',
    "condition" VARCHAR(20) NOT NULL DEFAULT 'GOOD',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "asset_units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_asset_units_unit_no"
ON "inventory"."asset_units" ("unit_no");

CREATE UNIQUE INDEX "uq_asset_units_asset_serial"
ON "inventory"."asset_units" ("asset_id", "serial_no")
WHERE "serial_no" IS NOT NULL;

CREATE INDEX "idx_asset_units_asset_id"
ON "inventory"."asset_units" ("asset_id");

CREATE INDEX "idx_asset_units_department_id"
ON "inventory"."asset_units" ("department_id");

CREATE INDEX "idx_asset_units_status"
ON "inventory"."asset_units" ("status");

ALTER TABLE "inventory"."asset_units"
ADD CONSTRAINT "fk_asset_units_asset"
FOREIGN KEY ("asset_id")
REFERENCES "inventory"."medical_assets"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;

ALTER TABLE "inventory"."asset_units"
ADD CONSTRAINT "fk_asset_units_department"
FOREIGN KEY ("department_id")
REFERENCES "public"."departments"("id")
ON DELETE NO ACTION
ON UPDATE NO ACTION;

-- Optional sync helper from current medical_assets rows.
-- This seeds one unit per existing asset using asset_code as the initial unit_no.
INSERT INTO "inventory"."asset_units"
(
    "asset_id",
    "unit_no",
    "serial_no",
    "department_id",
    "status",
    "condition",
    "note"
)
SELECT
    ma."id",
    ma."asset_code",
    ma."serial_no",
    ma."department_id",
    ma."status",
    'GOOD',
    ma."note"
FROM "inventory"."medical_assets" ma
ON CONFLICT ("unit_no") DO NOTHING;


-- Phase B: centralized barcode registry (multi-entity)
CREATE TABLE "inventory"."barcode_registry" (
    "id" BIGSERIAL NOT NULL,
    "barcode_value" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barcode_registry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_barcode_registry_entity_type"
        CHECK ("entity_type" IN ('ITEM', 'LOT', 'REUSABLE_UNIT', 'ASSET_UNIT', 'ASSET'))
);

CREATE UNIQUE INDEX "uq_barcode_registry_value"
ON "inventory"."barcode_registry" ("barcode_value");

CREATE INDEX "idx_barcode_registry_entity"
ON "inventory"."barcode_registry" ("entity_type", "entity_id");

CREATE UNIQUE INDEX "uq_barcode_registry_primary_per_entity"
ON "inventory"."barcode_registry" ("entity_type", "entity_id")
WHERE "is_primary" = true;

CREATE INDEX "idx_barcode_registry_active"
ON "inventory"."barcode_registry" ("is_active");
