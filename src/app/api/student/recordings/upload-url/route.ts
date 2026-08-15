import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireStudentApi } from "@/lib/student/dal";
import { createMyRecordingUploadUrl, StudentAuthorizationError } from "@/lib/student/queries";
import { InvalidRecordingError } from "@/lib/student-recordings";
import { createRecordingUploadRequestSchema } from "@/lib/validations/recording";
import { checkRateLimit } from "@/lib/rate-limit";

const UPLOAD_URL_LIMIT = 20;
const UPLOAD_URL_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireStudentApi();
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const allowed = await checkRateLimit(`recording-upload-url:${session.studentId}`, {
    limit: UPLOAD_URL_LIMIT,
    windowMs: UPLOAD_URL_WINDOW_MS,
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

  // .strict() in createRecordingUploadRequestSchema means a body carrying
  // studentId/studentProfileId 400s here — the student's identity comes
  // exclusively from `session`, above.
  const t = await getTranslations("validation");
  const parsed = createRecordingUploadRequestSchema(t).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const { signedUrl, token, path, bucket } = await createMyRecordingUploadUrl(
      session,
      parsed.data
    );
    return NextResponse.json({ signedUrl, token, path, bucket });
  } catch (err) {
    if (err instanceof StudentAuthorizationError) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    if (err instanceof InvalidRecordingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[recordings/upload-url] Failed to create signed upload URL:", err);
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }
}
