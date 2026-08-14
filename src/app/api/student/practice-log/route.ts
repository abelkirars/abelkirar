import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireStudentApi } from "@/lib/student/dal";
import { addMyPracticeLogEntry } from "@/lib/student/queries";
import { createPracticeLogEntrySchema } from "@/lib/validations/practice-log-entry";
import { checkRateLimit } from "@/lib/rate-limit";

// A student may log several practice sessions in a day; this exists to
// catch runaway bugs/accidental double-submits, not to throttle legitimate
// use. Keyed by the authenticated student's own id, not IP — the same
// convention the admin-authenticated write routes use once a session
// exists (see src/app/api/admin/students/route.ts).
const PRACTICE_LOG_CREATE_LIMIT = 60;
const PRACTICE_LOG_CREATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireStudentApi();
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const allowed = await checkRateLimit(`practice-log:${session.studentId}`, {
    limit: PRACTICE_LOG_CREATE_LIMIT,
    windowMs: PRACTICE_LOG_CREATE_WINDOW_MS,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many practice log entries created recently. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // .strict() in createPracticeLogEntrySchema means a body carrying
  // studentId/studentProfileId (or any other unexpected key) fails right
  // here with a 400 — it is never available below for addMyPracticeLogEntry
  // to see, ignore, or accidentally trust. The student's identity comes
  // exclusively from `session`, resolved above from requireStudentApi().
  const t = await getTranslations("validation");
  const parsed = createPracticeLogEntrySchema(t).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { practicedAt, durationMinutes, focus, selfRating } = parsed.data;

  const entry = await addMyPracticeLogEntry(session, {
    practicedAt: new Date(`${practicedAt}T00:00:00Z`),
    durationMinutes,
    focus,
    selfRating: selfRating || undefined,
  });

  return NextResponse.json({ entry });
}
