-- Manual payments (Zelle / Cash App) replacing Stripe as the active checkout flow.
-- Additive only: no columns, tables, or enum values are dropped, so existing
-- Stripe order history (Order.stripeCheckoutSessionId / stripePaymentIntentId)
-- remains intact and readable.

-- Extend OrderStatus with new fulfillment states used by the manual flow.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- New enums for manual payment methods and their verification status.
CREATE TYPE "PaymentMethod" AS ENUM ('ZELLE', 'CASH_APP', 'STRIPE_LEGACY');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING_VERIFICATION', 'PAID', 'PAYMENT_NOT_FOUND', 'REFUNDED');

-- Named admin accounts (multiple administrators, each with their own login).
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- New order fields: human-readable order number, payment method/status,
-- customer phone, and who/when an admin confirmed payment.
ALTER TABLE "Order"
    ADD COLUMN "orderNumber" TEXT,
    ADD COLUMN "paymentMethod" "PaymentMethod",
    ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    ADD COLUMN "customerPhone" TEXT,
    ADD COLUMN "paymentConfirmedById" TEXT,
    ADD COLUMN "paymentConfirmedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_paymentConfirmedById_fkey"
    FOREIGN KEY ("paymentConfirmedById") REFERENCES "Admin"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Customer-submitted proof of payment. Never auto-marks an order as paid.
CREATE TABLE "PaymentConfirmation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "amountSent" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "transactionReference" TEXT,
    "screenshotPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentConfirmation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentConfirmation"
    ADD CONSTRAINT "PaymentConfirmation_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Internal admin notes on an order.
CREATE TABLE "OrderNote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderNote"
    ADD CONSTRAINT "OrderNote_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderNote"
    ADD CONSTRAINT "OrderNote_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lightweight DB-backed rate limiter (no Redis in this project).
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitHit_key_createdAt_idx" ON "RateLimitHit"("key", "createdAt");
