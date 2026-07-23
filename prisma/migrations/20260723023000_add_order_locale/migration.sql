-- Track the customer's checkout locale (NEXT_LOCALE cookie at order creation)
-- so later admin-triggered emails (e.g. payment confirmed) can still be sent
-- in the customer's language instead of always English.
-- Additive only: existing rows backfill to 'en', the site's default locale.

ALTER TABLE "Order" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
