import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  toRequestedLevel,
  type CreateCourseApplicationInput,
} from "@/lib/validations/course-application";
import type { Locale } from "@/i18n/locale";

/**
 * Creates a course application and its initial submission event as one atomic
 * nested write — a single prisma.courseApplication.create call with
 * events: { create: { toStatus: "PENDING" } } nested inside it, so a rejection
 * on the parent insert (the duplicate-email unique index) rolls back the whole
 * statement and can never leave an orphan event behind. fromStatus and
 * actorAdminId are both omitted, correctly resolving to null per
 * prisma/schema.prisma's own comments on CourseApplicationEvent: null
 * fromStatus on the very first row (nothing to transition from), null
 * actorAdminId because the actor is the applicant, not an admin.
 *
 * Every field is mapped explicitly by name — never `data: parsed.data` — so a
 * future column added to CourseApplication can never silently become writable
 * through this public endpoint just by existing on the input type.
 * decisionReason, adminNotes, reviewedAt, reviewedById and studentProfileId are
 * never referenced here and stay at their schema defaults (null).
 *
 * Returns null on a genuine Prisma P2002 (the CourseApplication_open_email_key
 * partial unique index) so the caller can return the identical success response
 * whether this was a fresh application or a duplicate — this endpoint must
 * never reveal which happened. Only P2002 is treated this way; every other
 * error is rethrown untouched. A Prisma unique-violation error can carry the
 * applicant's email in its own message/meta, so nothing about the caught error
 * is logged or inspected here — the caller logs only the error's constructor
 * name and .code, never the error itself.
 *
 * The null return is also what stops a duplicate submission sending a second
 * pair of notification emails: the caller only notifies when a row comes back.
 */
export async function createCourseApplication(
  input: CreateCourseApplicationInput,
  locale: Locale
) {
  // Compared with === true, never truthiness. isUnder15 is a plain boolean on
  // the wire, but the column it lands in is three-state, and every read of it
  // downstream follows the same rule — see prisma/schema.prisma.
  const isChild = input.isUnder15 === true;

  try {
    return await prisma.courseApplication.create({
      data: {
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        country: input.country,
        // Only meaningful for applicants 15 and over; the form does not
        // collect it for a child, and guardianPhone is the number of record.
        phone: isChild ? null : (input.phone ?? null),
        lessonLanguage: input.lessonLanguage,
        // UNSURE becomes null through the single shared mapper. Nothing here
        // may substitute a level the applicant did not choose.
        requestedLevel: toRequestedLevel(input.requestedLevel),
        kirarModel: input.kirarModel,
        applicantMessage: input.applicantMessage ?? null,

        isUnder15: input.isUnder15,
        // All four guardian columns are written together or not at all. For an
        // applicant 15 or over they are forced to null here rather than merely
        // omitted, so a stale guardian field arriving in the request body can
        // never be persisted.
        guardianName: isChild ? (input.guardianName ?? null) : null,
        guardianRelationship: isChild ? (input.guardianRelationship ?? null) : null,
        guardianPhone: isChild ? (input.guardianPhone ?? null) : null,
        // Generated HERE, on the server, at the moment of the write. The
        // client sends only a boolean; a timestamp it could set would not be
        // evidence of anything. Validation has already guaranteed consent is
        // true whenever isChild is true, so this is never null for a child.
        guardianConsentAt: isChild && input.guardianConsent === true ? new Date() : null,

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

/**
 * Records that both notifications for an application were reported sent.
 *
 * Deliberately separate from the create above, and deliberately incapable of
 * failing anything. It runs only after the row exists and only when both
 * emails succeeded, so the worst case is that the timestamp is missing on an
 * application that was in fact notified — null means "unconfirmed", never
 * "sent", and over-reporting is the correct bias for a query whose whole
 * purpose is "did anybody fall through the cracks".
 *
 * Swallows its own error for the same reason the caller does: the applicant
 * has already been told their application was received, and nothing that
 * happens here may change that. The failure is logged by id only.
 */
export async function markNotificationsSent(id: string): Promise<void> {
  try {
    await prisma.courseApplication.update({
      where: { id },
      data: { notificationsSentAt: new Date() },
    });
  } catch {
    console.error(
      `[course-applications] Could not record notification delivery for application ${id}`
    );
  }
}
