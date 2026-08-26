-- =============================================================================
-- Course applications: the public apply -> admin decision -> account pipeline.
--
-- Nothing in this migration changes existing behaviour on its own. The one
-- statement that CAN change behaviour is the StudentProfile backfill in §4 —
-- read its comment before touching it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Status enum.
--    WAITLISTED is a holding state, not a terminal one: the approve path
--    accepts it as a source status, so promoting someone off the waiting list
--    never requires a second application.
-- ---------------------------------------------------------------------------
CREATE TYPE "CourseApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'WAITLISTED', 'DECLINED');

-- ---------------------------------------------------------------------------
-- 2. CourseApplication.
--    "email" is stored lower-cased by the application layer; the partial
--    unique index in §5 depends on that normalisation being done on write.
--    "decisionReason" is applicant-visible; "adminNotes" is not, and no query
--    that builds an outbound email may select it.
-- ---------------------------------------------------------------------------
CREATE TABLE "CourseApplication" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "requestedLevel" "StudentLevel",
    "applicantMessage" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" "CourseApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "decisionReason" TEXT,
    "adminNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "studentProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseApplication_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 3. CourseApplicationEvent — append-only status history.
--    "actorAdminId" is null for the applicant's own submission event and set
--    from the admin session for every decision; it is never client-suppliable.
--    "note" is private, same rule as CourseApplication."adminNotes".
-- ---------------------------------------------------------------------------
CREATE TABLE "CourseApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStatus" "CourseApplicationStatus",
    "toStatus" "CourseApplicationStatus" NOT NULL,
    "actorAdminId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 4. StudentProfile gains an explicit portal permission.
--
--    "portalAccess" is deliberately a separate fact from "status": approval
--    and account-enabled-ness are different things, and resolveStudentSession()
--    has to be able to tell them apart to show the right message. It defaults
--    to false so that the only way a NEW row gets access is an explicit grant
--    on the approval path.
--
--    THE BACKFILL BELOW IS LOAD-BEARING. Every StudentProfile that exists
--    today was created directly by the teacher, before applications existed,
--    and is approved by definition. Without the UPDATE, the guard added in a
--    later phase locks all of them out of the portal. Do not drop it, and do
--    not "simplify" the column to DEFAULT true — that would silently grant
--    access to rows created by any future code path that forgets to set it.
--
--    "approvedAt" stays NULL for those backfilled rows on purpose: writing
--    now() would fabricate an approval date that never happened.
-- ---------------------------------------------------------------------------
ALTER TABLE "StudentProfile"
    ADD COLUMN "portalAccess" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "approvedAt" TIMESTAMP(3);

UPDATE "StudentProfile" SET "portalAccess" = true;

-- ---------------------------------------------------------------------------
-- 5. Indexes.
--
--    "CourseApplication_open_email_key" is a PARTIAL, FUNCTIONAL unique index
--    and has no Prisma schema equivalent — Prisma can express neither partial
--    nor expression indexes, so this is the only place it is declared
--    (schema.prisma carries a comment saying so).
--
--    Partial, on status: it allows exactly one OPEN application per person
--    while leaving APPROVED and DECLINED rows unconstrained, which is what
--    makes re-application after a decline possible. A plain UNIQUE on "email"
--    would permanently bar anyone ever declined.
--
--    Functional, on lower("email"): the application layer already lower-cases
--    the address on write, but that is a convention a future code path can
--    forget. Indexing the lowered value means "Sara@..." cannot slip past the
--    constraint that "sara@..." is subject to, regardless of what the caller
--    does. Callers must therefore compare on the lowered value too — the plain
--    "CourseApplication_email_idx" below serves that, since stored values are
--    already normalised.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "CourseApplication_studentProfileId_key" ON "CourseApplication"("studentProfileId");
CREATE INDEX "CourseApplication_status_createdAt_idx" ON "CourseApplication"("status", "createdAt");
CREATE INDEX "CourseApplication_email_idx" ON "CourseApplication"("email");
CREATE UNIQUE INDEX "CourseApplication_open_email_key"
    ON "CourseApplication"(lower("email"))
    WHERE "status" IN ('PENDING', 'WAITLISTED');

CREATE INDEX "CourseApplicationEvent_applicationId_createdAt_idx" ON "CourseApplicationEvent"("applicationId", "createdAt");

-- ---------------------------------------------------------------------------
-- 6. Foreign keys.
--    Admin references are SetNull so removing an admin account never blocks on
--    historical applications. The student reference is SetNull rather than
--    Cascade for the same reason in reverse: deleting a student must not erase
--    the record that they once applied. Events cascade with their application,
--    which is the only row they have meaning relative to.
-- ---------------------------------------------------------------------------
ALTER TABLE "CourseApplication" ADD CONSTRAINT "CourseApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CourseApplication" ADD CONSTRAINT "CourseApplication_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CourseApplicationEvent" ADD CONSTRAINT "CourseApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CourseApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseApplicationEvent" ADD CONSTRAINT "CourseApplicationEvent_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security: deny-all with zero policies, matching every other
--    table (see 20260729001047_enable_rls_deny_all for the full reasoning).
--    Applicant rows carry personal information and a private admin note, so
--    these two tables are exactly the kind this posture exists for.
--    That migration's ALTER DEFAULT PRIVILEGES already denies anon/authenticated
--    any grant on tables created afterwards; this adds the matching RLS layer
--    explicitly rather than relying on it alone.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."CourseApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CourseApplicationEvent" ENABLE ROW LEVEL SECURITY;
