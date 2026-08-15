import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { getRecordingSignedUrl } from "@/lib/student-recordings";

// A separate route from the student-facing one on purpose — not one route
// branching on role. Admin and student have always had fully separate
// DAL/route trees in this app; combining them would be the first file
// importing both requireAdminApi and requireStudentApi, for no benefit.
// Not scoped to the assigned teacher — no admin route in this app filters
// by teacherId today, so this matches existing precedent (any admin sees
// any student's data) rather than inventing new restriction just here.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string; weeklyPracticeId: string; attachmentId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId, weeklyPracticeId, attachmentId } = await params;

  const attachment = await prisma.weeklyPracticeAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      storagePath: true,
      weeklyPracticeId: true,
      weeklyPractice: { select: { studentId: true } },
    },
  });

  if (
    !attachment ||
    attachment.weeklyPracticeId !== weeklyPracticeId ||
    attachment.weeklyPractice.studentId !== studentId
  ) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const url = await getRecordingSignedUrl(attachment.storagePath);
  if (!url) {
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
  }

  return NextResponse.redirect(url);
}
