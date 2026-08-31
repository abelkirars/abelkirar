import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CreateCourseApplicationInput } from "@/lib/validations/course-application";
import type { Locale } from "@/i18n/locale";

/**
 * Creates a course application and its initial submission event as one
 * atomic nested write — a single prisma.courseApplication.create call with
 * events: { create: { toStatus: "PENDING" } } nested inside it, so a
 * rejection on the parent insert (the duplicate-email unique index) rolls
 * back the whole statement and can never leave an orphan event behind.
 * fromStatus and actorAdminId are both omitted, correctly resolving to null
 * per prisma/schema.prisma's own comments on CourseApplicationEvent: null
 * fromStatus on the very first row (nothing to transition from), null
 * actorAdminId because the actor is the applicant, not an admin.
 *
 * Every field is mapped explicitly by name — never `data: parsed.data` —
 * so a future column added to CourseApplication can never silently become
 * writable through this public endpoint just by existing on the input type.
 * decisionReason, adminNotes, reviewedAt, reviewedById and studentProfileId
 * are never referenced here and stay at their schema defaults (null).
 *
 * Returns null on a genuine Prisma P2002 (the CourseApplication_open_email_key
 * partial unique index) so the caller can return the identical success
 * response whether this was a fresh application or a duplicate — this
 * endpoint must never reveal which happened. Only P2002 is treated this
 * way; every other error is rethrown untouched. A Prisma unique-violation
 * error can carry the applicant's email in its own message/meta, so nothing
 * about the caught error is logged or inspected here — the caller logs only
 * the error's constructor name and .code, never the error itself.
 */
export async function createCourseApplication(
  input: CreateCourseApplicationInput,
  locale: Locale
) {
  try {
    return await prisma.courseApplication.create({
      data: {
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        requestedLevel: input.requestedLevel,
        applicantMessage: input.applicantMessage,
        locale,
        status: "PENDING",
        events: { create: { toStatus: "PENDING" } },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }
}
