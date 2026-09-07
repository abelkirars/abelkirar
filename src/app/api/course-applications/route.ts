import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import {
  createCourseApplicationSchema,
  normalizeOptionalFields,
} from "@/lib/validations/course-application";
import { createCourseApplication, markNotificationsSent } from "@/lib/course-applications";
import { sendCourseApplicationNotifications } from "@/lib/notifications/course-application-notifications";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import type { Locale } from "@/i18n/locale";

export async function POST(request: Request) {
  // Obtained before it's needed by either the rate-limit response or Zod
  // validation, so the 429 message is localized too — not just the 400s.
  const t = await getTranslations("validation");

  const ip = clientIpFrom(request);
  const allowed = await checkRateLimit(`create-course-application:${ip}`, {
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json({ error: t("tooManyApplications") }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const normalizedBody =
    body !== null && typeof body === "object"
      ? normalizeOptionalFields(body as Record<string, unknown>)
      : body;

  const parsed = createCourseApplicationSchema(t).safeParse(normalizedBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  let created: Awaited<ReturnType<typeof createCourseApplication>> = null;
  try {
    const locale = (await getLocale()) as Locale;
    // A caught duplicate returns null. The response below is identical either
    // way — this endpoint must never reveal which one happened — but the null
    // is load-bearing for notifications: only a genuinely new row is
    // announced, so a duplicate submission neither tells an enumerator that an
    // address is already on file nor mails the real applicant a second time.
    created = await createCourseApplication(parsed.data, locale);
  } catch (err) {
    // Sanitized logging only — never the error object, its .message, its
    // .meta, the applicant's email, or the request body.
    //
    // The class name is checked against an explicit allow-list, not a
    // regex: no arbitrary string can reach the log this way at all. It is
    // kept, not dropped, because the staging verification for this phase
    // must observe what error a duplicate insert actually produces against
    // the migration-only partial unique index
    // CourseApplication_open_email_key — the single unresolved question
    // this endpoint's duplicate handling depends on. If P2002 doesn't fire,
    // the code below logs as UNKNOWN, and the class name becomes the only
    // remaining signal distinguishing a PrismaClientKnownRequestError
    // carrying some other code from a raw, unclassified driver error.
    const ALLOWED_ERROR_NAMES = new Set([
      "PrismaClientKnownRequestError",
      "PrismaClientUnknownRequestError",
      "PrismaClientValidationError",
      "PrismaClientInitializationError",
      "PrismaClientRustPanicError",
      "Error",
      "TypeError",
      "RangeError",
    ]);
    const rawName = err instanceof Error ? err.constructor.name : undefined;
    const name =
      typeof rawName === "string" && ALLOWED_ERROR_NAMES.has(rawName) ? rawName : "UNKNOWN";

    const rawCode = (err as { code?: unknown } | null)?.code;
    const code =
      typeof rawCode === "string" && /^[A-Z0-9_]{1,32}$/.test(rawCode) ? rawCode : "UNKNOWN";

    console.error(
      "[course-applications] Unexpected error creating application — name:",
      name,
      "code:",
      code
    );
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  // The application is already saved at this point — a notification failure
  // must never turn into an error response for an application that succeeded.
  // With no admin review desk built yet, email is the ONLY way the teacher
  // learns an application arrived, so a failure here is logged loudly rather
  // than swallowed.
  //
  // Only for `created`: a duplicate (null) sends nothing at all.
  //
  // Awaited rather than fired and forgotten, because a serverless instance can
  // be frozen the moment the response is returned and an unawaited send would
  // simply not happen. The cost is that a new application takes slightly longer
  // to respond than a duplicate; the response body and status are identical, so
  // this is a timing difference only, and reliability of the one channel the
  // teacher actually has is worth more than closing it.
  if (created) {
    try {
      const { admin, applicant } = await sendCourseApplicationNotifications({
        id: created.id,
        fullName: created.fullName,
        email: created.email,
        country: created.country,
        phone: created.phone,
        lessonLanguage: created.lessonLanguage,
        requestedLevel: created.requestedLevel,
        kirarModel: created.kirarModel,
        applicantMessage: created.applicantMessage,
        isUnder15: created.isUnder15,
        guardianName: created.guardianName,
        guardianRelationship: created.guardianRelationship,
        guardianPhone: created.guardianPhone,
        locale: created.locale as Locale,
      });

      // Identifiers only. Never a name, an email address, or any other field
      // of the application — the same rule the error branch above follows.
      if (!admin.sent) {
        console.error(
          `[course-applications] Admin notification NOT sent for application ${created.id}`
        );
      }
      if (!applicant.sent) {
        console.error(
          `[course-applications] Applicant confirmation NOT sent for application ${created.id}`
        );
      }

      // Recorded on the row ONLY when both channels succeeded, so that
      //   SELECT id FROM "CourseApplication" WHERE "notificationsSentAt" IS NULL
      // lists every application nobody was reliably told about. Partial
      // success stays null on purpose: one of the two people who should have
      // been emailed was not, and that is not a delivered notification.
      if (admin.sent && applicant.sent) {
        await markNotificationsSent(created.id);
      }
    } catch {
      // sendCourseApplicationNotifications is documented never to reject, so
      // reaching here means something changed underneath it. Still cannot be
      // allowed to fail the request: the row is saved and the applicant has
      // done nothing wrong.
      console.error(
        `[course-applications] Notification dispatch threw for application ${created.id}`
      );
    }
  }

  return NextResponse.json({ ok: true });
}
