import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { generateStudentInviteLink, StudentInviteError } from "@/lib/supabase-admin-auth";
import { notificationService } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";

// Per-student cap — a student legitimately might need 2-3 resends (lost
// email, expired link), but more than a handful in an hour signals something
// wrong (e.g. a stuck UI double-firing) rather than a real need, so this
// stays tight even though the per-admin creation limit doesn't.
const INVITE_RESEND_LIMIT = 5;
const INVITE_RESEND_WINDOW_MS = 60 * 60 * 1000;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId } = await params;
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const allowed = await checkRateLimit(`student-invite-resend:${studentId}`, {
    limit: INVITE_RESEND_LIMIT,
    windowMs: INVITE_RESEND_WINDOW_MS,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many resend attempts recently. Please try again later." },
      { status: 429 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;
  let actionLink: string;
  try {
    const invite = await generateStudentInviteLink(
      student.email,
      `${siteUrl}/student/set-password`
    );
    actionLink = invite.actionLink;
  } catch (err) {
    if (err instanceof StudentInviteError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[admin/students] Failed to resend invite:", err);
    return NextResponse.json({ error: "Failed to resend invite" }, { status: 500 });
  }

  // The link itself was generated successfully at this point — an email
  // delivery failure is a distinct, non-fatal outcome, not an error to
  // return 500 for.
  const emailResult = await notificationService.notifyStudentInvite(
    student.email,
    student.fullName,
    actionLink,
    student.locale
  );

  return NextResponse.json({
    ok: true,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.error,
  });
}
