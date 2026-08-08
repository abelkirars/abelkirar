-- Custom Made quote-first flow (Phase 1 — schema only; no application code
-- reads or writes any of this yet). Additive only: no columns, tables, or
-- enum values are dropped.

-- New enum values for the quote-first Custom Made flow.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING_QUOTE';
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'CUSTOM_QUOTE';

-- New nullable columns on Order for the Custom Made quote-request flow. All
-- nullable; existing rows and the normal manual-payment flow are completely
-- unaffected.
ALTER TABLE "Order"
    ADD COLUMN "customOrderDescription" TEXT,
    ADD COLUMN "customOrderImagePath" TEXT,
    ADD COLUMN "quotedAt" TIMESTAMP(3),
    ADD COLUMN "quotedById" TEXT;

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_quotedById_fkey"
    FOREIGN KEY ("quotedById") REFERENCES "Admin"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-attempt log of outbound order-notification emails (customer- and
-- admin-facing), so a failed send is visible on /admin/orders instead of
-- only in application logs. One row per send attempt across the order's
-- lifecycle — reuses the existing NotificationDeliveryStatus enum already
-- used for Order.smsStatus/whatsappStatus, rather than introducing a second
-- PENDING/SENT/FAILED-shaped enum.
CREATE TABLE "OrderNotificationLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderNotificationLog_orderId_idx" ON "OrderNotificationLog"("orderId");

ALTER TABLE "OrderNotificationLog"
    ADD CONSTRAINT "OrderNotificationLog_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
