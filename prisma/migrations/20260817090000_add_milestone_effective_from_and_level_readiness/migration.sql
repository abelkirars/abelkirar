-- Stage 9 (student progress percentage). Additive only: one new column on
-- Milestone, one new table. Nothing on StudentProfile — the per-student
-- baseline this feature needs is derived from existing
-- StudentMilestone.assignedAt at read time, not stored. See
-- getMyLevelProgress in src/lib/student/queries.ts (not yet written) and
-- the Stage 9 design notes in docs/DECISIONS.md.

-- AddColumn
-- Confirmed via the seed script and a full grep of every admin route: the
-- Milestone table has zero rows today (no seed data creates one, no admin
-- route has ever existed to create one), so this DEFAULT backfills
-- nothing right now. Recorded anyway for whoever re-runs or adapts this
-- migration later, against a database that is NOT empty: ADD COLUMN ...
-- DEFAULT now() sets effectiveFrom to the MOMENT THIS MIGRATION RUNS for
-- every pre-existing row, uniformly — not each row's true original
-- creation time. If Milestone rows ever exist before this runs, this
-- default is wrong for backfill purposes and needs a real one-time value
-- per row (e.g. copied from createdAt) instead of relying on the column
-- default.
ALTER TABLE "Milestone" ADD COLUMN "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "LevelReadiness" (
    "level" "StudentLevel" NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelReadiness_pkey" PRIMARY KEY ("level")
);

-- Row Level Security: same deny-all, zero-policy posture as every other
-- table in this project (see 20260729001047_enable_rls_deny_all and
-- every migration since). Defense in depth only — real authorization is
-- application code (src/lib/student/queries.ts for the read side,
-- requireAdminApi()-gated routes for the write side).
ALTER TABLE "LevelReadiness" ENABLE ROW LEVEL SECURITY;
