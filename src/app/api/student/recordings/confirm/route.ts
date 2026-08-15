import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireStudentApi } from "@/lib/student/dal";
import { confirmMyRecordingUpload, StudentAuthorizationError } from "@/lib/student/queries";
import { InvalidRecordingError } from "@/lib/student-recordings";
import { createRecordingConfirmSchema } from "@/lib/validations/recording";
import { checkRateLimit } from "@/lib/rate-limit";

const CONFIRM_LIMIT = 20;
const CONFIRM_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireStudentApi();
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const allowed = await checkRateLimit(`recording-confirm:${session.studentId}`, {
    limit: CONFIRM_LIMIT,
    windowMs: CONFIRM_WINDOW_MS,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many upload attempts recently. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const t = await getTranslations("validation");
  const parsed = createRecordingConfirmSchema(t).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const attachment = await confirmMyRecordingUpload(session, parsed.data);
    return NextResponse.json({ attachment });
  } catch (err) {
    if (err instanceof StudentAuthorizationError) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    if (err instanceof InvalidRecordingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[recordings/confirm] Failed to confirm recording upload:", err);
    return NextResponse.json({ error: "Failed to save recording" }, { status: 500 });
  }
}
