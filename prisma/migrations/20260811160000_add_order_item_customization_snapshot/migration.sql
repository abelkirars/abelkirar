-- Order-time customization snapshot (schema only — no application code
-- reads or writes it yet). Additive only: one new nullable column, no
-- drops, no NOT NULL on any existing column, no enum changes.

ALTER TABLE "OrderItem" ADD COLUMN "selectedCustomizationSnapshot" JSONB;
