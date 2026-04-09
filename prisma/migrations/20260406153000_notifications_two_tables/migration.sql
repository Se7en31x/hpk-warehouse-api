-- CreateTable
CREATE TABLE "inventory"."notifications" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'INFO',
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "entity_type" VARCHAR(60),
    "entity_id" VARCHAR(100),
    "entity_code" VARCHAR(100),
    "dedupe_key" VARCHAR(200),
    "metadata" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."notification_recipients" (
    "id" SERIAL NOT NULL,
    "notification_id" INTEGER NOT NULL,
    "recipient_id" UUID NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "delivered_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_notifications_type"
ON "inventory"."notifications" ("type");

-- CreateIndex
CREATE INDEX "idx_notifications_created_at"
ON "inventory"."notifications" ("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notifications_entity"
ON "inventory"."notifications" ("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_notifications_dedupe_key"
ON "inventory"."notifications" ("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_notification_recipient"
ON "inventory"."notification_recipients" ("notification_id", "recipient_id");

-- CreateIndex
CREATE INDEX "idx_notification_recipient_unread"
ON "inventory"."notification_recipients" ("recipient_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notification_recipient_created"
ON "inventory"."notification_recipients" ("recipient_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "inventory"."notifications"
ADD CONSTRAINT "fk_notifications_created_by_profile"
FOREIGN KEY ("created_by_id")
REFERENCES "public"."profiles"("id")
ON DELETE NO ACTION
ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory"."notification_recipients"
ADD CONSTRAINT "fk_notification_recipient_notification"
FOREIGN KEY ("notification_id")
REFERENCES "inventory"."notifications"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory"."notification_recipients"
ADD CONSTRAINT "fk_notification_recipient_profile"
FOREIGN KEY ("recipient_id")
REFERENCES "public"."profiles"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;
