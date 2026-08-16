import type { StudentLevel } from "@prisma/client";

/**
 * Which levels currently show a milestone-progress PERCENTAGE rather than
 * "In Progress" (Stage 9). Code, not a database row — deliberately: this
 * flips rarely (once per level, ever, in the expected case) and is a
 * genuine content decision (is this level's milestone catalog stable
 * enough to expose a fraction of it), not routine admin data entry.
 *
 * A LevelReadiness table exists in the schema from an earlier version of
 * this design (see its own comment in prisma/schema.prisma) but is
 * unused by this file on purpose — retained, not deleted, in case the
 * admin-toggle version is wanted back later without a fresh migration.
 *
 * All three start false — nothing has been marked ready yet.
 */
export const PERCENT_READY: Record<StudentLevel, boolean> = {
  BEGINNER: false,
  INTERMEDIATE: false,
  ADVANCED: false,
};
