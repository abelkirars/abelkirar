-- =============================================================================
-- Enable Row Level Security (deny-all) on every table in the public schema,
-- and revoke the default Supabase anon/authenticated grants.
--
-- WHY THERE ARE NO POLICIES (intentional, not incomplete):
-- This application never uses Supabase's PostgREST API. All data access goes
-- through Prisma over a direct Postgres connection, authenticating as the
-- `postgres` role, which has the BYPASSRLS attribute (confirmed empirically)
-- and therefore ignores RLS entirely, policies or not. Authorization (which
-- admin can see which order, which student can see only their own records,
-- etc.) is enforced in the application's data-access layer
-- (src/lib/admin/dal.ts, src/lib/student/dal.ts), not in the database.
-- Writing auth.uid()-based RLS policies here would be fiction: there is no
-- browser-facing PostgREST access path for these tables to authorize, and
-- doing so would duplicate — and could silently drift from — the
-- authorization logic that correctly lives in the DAL.
--
-- The goal here is narrower and purely defensive: if PostgREST is ever
-- reached for these tables (leaked anon key, a future feature accidentally
-- exposing the data API, etc.), the answer must be "nothing", not
-- "everything". RLS enabled with zero policies means every role except the
-- table owner (and other BYPASSRLS roles) sees zero rows and can write zero
-- rows, unconditionally. Combined with the REVOKE below, this is two
-- independent, redundant denial layers for anon/authenticated specifically.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enable RLS, no policies, on every table Security Advisor flagged
--    (all 16 — including _prisma_migrations).
--    Deliberately NOT FORCE ROW LEVEL SECURITY: FORCE would apply RLS to the
--    table owner too, which would break Prisma (postgres owns every table
--    here). Plain ENABLE leaves the owner/BYPASSRLS roles unaffected while
--    still gating every other role.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."Admin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ContactSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MonthlyLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MonthlyLogAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."NewsletterSubscriber" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."OrderNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PaymentConfirmation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RateLimitHit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StudentProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WeeklyPractice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WeeklyPracticeAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Defense in depth: revoke the blanket grants Supabase's project bootstrap
--    gives anon/authenticated on every public table by default. Even if RLS
--    were ever misconfigured later, these roles have no underlying SQL
--    privilege to fall back on. (Covers views too, if any ever exist — Postgres
--    treats "ALL TABLES IN SCHEMA" as including views for GRANT/REVOKE.)
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Prevent this exposure from silently reappearing on tables created by
--    future Prisma migrations. Without this, any new table `postgres` creates
--    in `public` would again get full anon/authenticated privileges by
--    default, same as these 16 originally did.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
