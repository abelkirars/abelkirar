-- StudentNote gains a per-row visibility flag: a Stage 7 decision to store
-- feedback (including private teacher observations) on StudentNote rather
-- than a second table. Defaults to true so every existing row keeps
-- reading exactly as it does today. The default alone does not make
-- anything private — src/lib/student/queries.ts's listMyNotes filters on
-- this column in the same change; the column existing on its own would be
-- decorative, not a real guard.
ALTER TABLE "StudentNote" ADD COLUMN "visibleToStudent" BOOLEAN NOT NULL DEFAULT true;
