import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateStudentInviteLink } from "@/lib/supabase-admin-auth";
import { notificationService } from "@/lib/notifications";

const emailCorrectionSchema = z.object({ email: z.email() });

/**
 * Corrects a typo'd email — intentionally narrow: only reachable while the
 * student has never activated their account (see the activatedAt check
 * below), since once they have, this is a real account with real login
 * history, and silently repointing it is a different, riskier operation than
 * fixing a typo before anyone's used the account.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId } = await params;
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const parsed = emailCorrectionSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid email" },
      { status: 400 }
    );
  }
  const newEmail = parsed.data.email;

  if (newEmail === student.email) {
    return NextResponse.json({ error: "That's already this student's email." }, { status: 400 });
  }

  // Narrow on purpose: once a student has actually saved a password
  // (StudentProfile.activatedAt, set by /api/student/set-password), this is
  // a real account with real login history, and silently repointing it is a
  // different, riskier operation than fixing a typo before anyone's used it.
  if (student.activatedAt) {
    return NextResponse.json(
      {
        error:
          "This student has already activated their account — their email can no longer be changed here.",
      },
      { status: 409 }
    );
  }

  const conflict = await prisma.studentProfile.findUnique({ where: { email: newEmail } });
  if (conflict) {
    return NextResponse.json(
      { error: "A student with this email already exists." },
      { status: 409 }
    );
  }

  // Prisma first (cheap, easy to reverse) — if the follow-up Supabase update
  // fails, we revert this immediately so the two never disagree about which
  // email is authoritative.
  try {
    await prisma.studentProfile.update({ where: { id: studentId }, data: { email: newEmail } });
  } catch (err) {
    console.error("[admin/students] Failed to update StudentProfile.email:", err);
    return NextResponse.json({ error: "Failed to update student email" }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    student.supabaseUserId,
    { email: newEmail, email_confirm: false }
  );
  if (updateError) {
    try {
      await prisma.studentProfile.update({ where: { id: studentId }, data: { email: student.email } });
    } catch (rollbackErr) {
      console.error(
        `[admin/students] CRITICAL: failed to roll back StudentProfile.email after a Supabase update ` +
          `failure for student ${studentId}. Supabase still has email ${student.email} but StudentProfile.email ` +
          `is now ${newEmail} — these are OUT OF SYNC and need manual reconciliation.`,
        rollbackErr
      );
    }
    console.error("[admin/students] Failed to update Supabase user email:", updateError.message);
    return NextResponse.json({ error: "Failed to update email" }, { status: 500 });
  }

  // Both sides are now updated and in agreement. Send a fresh invite to the
  // corrected address — the old link (if any) pointed at an email the
  // student can no longer prove ownership of via this account. The
  // correction itself has already succeeded and is saved regardless of what
  // happens below — admin can use "Resend invite" separately if needed.
  let emailSent = false;
  let emailError: string | undefined;
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;
    const invite = await generateStudentInviteLink(newEmail, `${siteUrl}/student/set-password`);
    const emailResult = await notificationService.notifyStudentInvite(
      newEmail,
      student.fullName,
      invite.actionLink,
      student.locale
    );
    emailSent = emailResult.sent;
    emailError = emailResult.sent ? undefined : emailResult.error;
  } catch (err) {
    console.error("[admin/students] Email corrected but failed to generate a fresh invite link:", err);
    emailError = "Failed to generate a fresh invite link";
  }

  const updated = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  return NextResponse.json({ ok: true, student: updated, emailSent, emailError });
}
