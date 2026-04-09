-- CreateTable
CREATE TABLE "category" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "code_prefix" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "code" TEXT,
    "category_id" INTEGER,
    "unit_id" INTEGER,
    "warehouse_id" INTEGER,
    "min_stock" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT,
    "deleted_at" TIMESTAMP(6),
    "deleted_by_id" INTEGER,
    "deleted_by" TEXT,
    "image_url" TEXT,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER,
    "lot_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "reason" TEXT,
    "created_by_id" INTEGER,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "location" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_lot" (
    "id" TEXT NOT NULL,
    "item_id" INTEGER,
    "quantity" INTEGER,
    "expried_at" TIMESTAMP(6),
    "warehouse_id" INTEGER,
    "created_at" TIMESTAMP(6),
    "status" TEXT,
    "deleted_at" TIMESTAMP(6),
    "deleted_by" TEXT,
    "image_url" TEXT,
    "deleted_by_id" TEXT,

    CONSTRAINT "item_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_allocation" (
    "id" SERIAL NOT NULL,
    "req_item_id" INTEGER NOT NULL,
    "lot_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "status" VARCHAR(20) DEFAULT 'PENDING',

    CONSTRAINT "item_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_transaction" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "target_table" VARCHAR(50),
    "target_id" VARCHAR(50),
    "old_data" JSONB,
    "new_data" JSONB,
    "description" TEXT,
    "status" VARCHAR(20),
    "username" VARCHAR(100),
    "ip_address" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_header" (
    "id" SERIAL NOT NULL,
    "doc_no" VARCHAR(50),
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "requester_id" INTEGER NOT NULL,
    "approver_id" INTEGER,
    "request_date" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMPTZ(6),
    "return_date" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisition_header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_item" (
    "id" SERIAL NOT NULL,
    "header_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "req_qty" INTEGER NOT NULL,
    "approved_qty" INTEGER,
    "issued_qty" INTEGER DEFAULT 0,
    "returned_qty" INTEGER DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "requisition_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_alloc_req_item" ON "item_allocation"("req_item_id");

-- CreateIndex
CREATE INDEX "idx_logs_action" ON "logs_transaction"("action");

-- CreateIndex
CREATE INDEX "idx_logs_created_at" ON "logs_transaction"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "requisition_header_doc_no_key" ON "requisition_header"("doc_no");

-- CreateIndex
CREATE INDEX "idx_req_header_doc_no" ON "requisition_header"("doc_no");

-- CreateIndex
CREATE INDEX "idx_req_header_status" ON "requisition_header"("status");

-- CreateIndex
CREATE INDEX "idx_req_item_header" ON "requisition_item"("header_id");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_lot" ADD CONSTRAINT "item_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_lot" ADD CONSTRAINT "warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_allocation" ADD CONSTRAINT "fk_req_item_alloc" FOREIGN KEY ("req_item_id") REFERENCES "requisition_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_allocation" ADD CONSTRAINT "item_allocation_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "item_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_item" ADD CONSTRAINT "fk_req_header" FOREIGN KEY ("header_id") REFERENCES "requisition_header"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition_item" ADD CONSTRAINT "requisition_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
