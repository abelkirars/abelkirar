-- Add a payment region selector (United States / Eurozone) to manual checkout.
-- Additive only: no columns, tables, or enum values are dropped.

-- New enum value for the Eurozone manual payment method.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'EUR_BANK_TRANSFER';

-- New enum for the payment region selected at checkout.
CREATE TYPE "PaymentRegion" AS ENUM ('US', 'EUROZONE');

-- New nullable column — legacy/Stripe orders and pre-existing manual orders
-- have no region and remain NULL; new orders always set it.
ALTER TABLE "Order" ADD COLUMN "paymentRegion" "PaymentRegion";
