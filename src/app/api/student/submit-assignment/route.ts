import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireStudentApi } from "@/lib/student/dal";
import { submitCurrentAssignment, AssignmentSubmissionError } from "@/lib/student/queries";
import { createAssignmentSubmissionSchema } from "@/lib/validations/assignment-submission";
import { checkRateLimit } from "@/lib/rate-limit";

// Matches the practice-log route's convention: keyed by the authenticated
// student's own id, not IP.
const SUBMIT_LIMIT = 20;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireStudentApi();
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const allowed = await checkRateLimit(`submit-assignment:${session.studentId}`, {
    limit: SUBMIT_LIMIT,
    windowMs: SUBMIT_WINDOW_MS,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submission attempts recently. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // .strict() in createAssignmentSubmissionSchema means a body carrying
  // studentId/studentProfileId (or any other unexpected key) 400s here —
  // the student's identity comes exclusively from `session`, above.
  const t = await getTranslations("validation");
  const parsed = createAssignmentSubmissionSchema(t).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const assignment = await submitCurrentAssignment(session, parsed.data);
    return NextResponse.json({ assignment });
  } catch (err) {
    if (err instanceof AssignmentSubmissionError) {
      const status = err.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("[submit-assignment] Failed to submit assignment:", err);
    return NextResponse.json({ error: "Failed to submit assignment" }, { status: 500 });
  }
}
