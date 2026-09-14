CREATE TYPE "CourseDiscountType" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "CoursePrice" (
    "slug" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "discountType" "CourseDiscountType",
    "discountValue" INTEGER,
    "discountActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoursePrice_pkey" PRIMARY KEY ("slug"),
    CONSTRAINT "CoursePrice_price_positive" CHECK ("priceCents" > 0),
    -- PERCENT values are whole percentages; FIXED values are CENTS.
    CONSTRAINT "CoursePrice_discount_valid" CHECK (
      ("discountType" IS NULL AND "discountValue" IS NULL AND NOT "discountActive")
      OR ("discountType" IS NOT NULL AND "discountType" = 'PERCENT' AND "discountValue" IS NOT NULL AND "discountValue" BETWEEN 1 AND 100)
      OR ("discountType" IS NOT NULL AND "discountType" = 'FIXED' AND "discountValue" IS NOT NULL AND "discountValue" > 0 AND "discountValue" < "priceCents")
    )
);

INSERT INTO "CoursePrice" ("slug", "priceCents", "updatedAt") VALUES
    ('beginner', 7000, CURRENT_TIMESTAMP),
    ('intermediate', 8500, CURRENT_TIMESTAMP),
    ('advanced', 10000, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------------
-- Row Level Security: deny-all with zero policies, matching every other table
-- (see 20260729001047_enable_rls_deny_all for the full reasoning).
-- Course prices are public information, so this is not about secrecy: it is
-- about WRITES. An unauthenticated PostgREST reach onto this table must never
-- be able to change what the site charges. That migration's ALTER DEFAULT
-- PRIVILEGES already denies anon/authenticated any grant on tables created
-- afterwards; this adds the matching RLS layer explicitly rather than relying
-- on it alone. Prisma connects as `postgres` (BYPASSRLS), so the admin editor
-- and the public read path are unaffected.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."CoursePrice" ENABLE ROW LEVEL SECURITY;
