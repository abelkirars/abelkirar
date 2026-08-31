import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import {
  createCourseApplicationSchema,
  normalizeOptionalFields,
} from "@/lib/validations/course-application";
import { createCourseApplication } from "@/lib/course-applications";
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

  try {
    const locale = (await getLocale()) as Locale;
    // Return value is intentionally unused: whether this was a fresh
    // application or a caught duplicate (createCourseApplication returns
    // null for that case), the response below is identical either way —
    // this endpoint must never reveal which one happened.
    await createCourseApplication(parsed.data, locale);
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

  return NextResponse.json({ ok: true });
}
