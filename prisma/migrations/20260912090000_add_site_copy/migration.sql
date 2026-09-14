-- CreateTable
CREATE TABLE "SiteCopy" (
    "locale" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SiteCopy_pkey" PRIMARY KEY ("locale","key")
);

-- ---------------------------------------------------------------------------
-- Row Level Security: deny-all with zero policies, matching every other table
-- (see 20260729001047_enable_rls_deny_all for the full reasoning).
-- These rows are admin-authored public marketing copy, so the risk guarded
-- here is a write, not a read: nobody but the application may edit the words
-- the site shows. That migration's ALTER DEFAULT PRIVILEGES already denies
-- anon/authenticated any grant on tables created afterwards; this adds the
-- matching RLS layer explicitly rather than relying on it alone. Prisma
-- connects as `postgres` (BYPASSRLS), so the editor and the i18n fallback
-- path are unaffected.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."SiteCopy" ENABLE ROW LEVEL SECURITY;
