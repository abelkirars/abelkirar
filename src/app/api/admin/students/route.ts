import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { studentSchema } from "@/lib/validations/student";
import {
  generateStudentInviteLink,
  generateStudentRecoveryLink,
  deleteSupabaseUser,
  findSupabaseUserByEmail,
  StudentInviteError,
} from "@/lib/supabase-admin-auth";
import { notificationService } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";

// A single admin registers a whole cohort of students in one sitting — this
// is an admin-only internal tool, not a public-facing endpoint, so a
// generous limit is fine. It exists to catch runaway bugs/accidental
// double-submits, not to throttle legitimate bulk registration.
const INVITE_CREATE_LIMIT = 100;
const INVITE_CREATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const allowed = await checkRateLimit(`student-invite:${auth.session.adminId}`, {
    limit: INVITE_CREATE_LIMIT,
    windowMs: INVITE_CREATE_WINDOW_MS,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many invites sent recently. Please try again later." },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const parsed = studentSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    level: formData.get("level") || undefined,
    enrollmentDate: formData.get("enrollmentDate"),
    status: formData.get("status"),
    notes: formData.get("notes") || undefined,
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { fullName, email, phone, level, enrollmentDate, status, notes, locale } = parsed.data;

  const existingProfile = await prisma.studentProfile.findUnique({ where: { email } });
  if (existingProfile) {
    return NextResponse.json(
      { error: "A student with this email already exists." },
      { status: 409 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;
  const redirectTo = `${siteUrl}/student/set-password`;

  let invite: { actionLink: string; supabaseUserId: string };
  // True only when `invite` refers to a Supabase auth user that already
  // existed before this request (adopted below) — never delete that user on
  // a later failure, since we didn't create it and it isn't ours to remove.
  let adoptedExistingAuthUser = false;

  try {
    invite = await generateStudentInviteLink(email, redirectTo);
  } catch (err) {
    if (!(err instanceof StudentInviteError) || err.code !== "email_exists") {
      console.error("[admin/students] Failed to generate invite link:", err);
      return NextResponse.json({ error: "Failed to create student account" }, { status: 500 });
    }

    // Supabase already has an auth user for this email. That's either a
    // genuine duplicate (a StudentProfile really does reference it, just not
    // by this email — a rare split-brain case) or an orphan left behind by a
    // registration that failed after the auth user was created but before
    // its StudentProfile — most likely because this exact cleanup step
    // (deleteSupabaseUser) itself failed at the time. Tell them apart before
    // deciding what to do.
    const existingAuthUser = await findSupabaseUserByEmail(email);
    if (!existingAuthUser) {
      console.error(
        `[admin/students] Supabase reported email_exists for ${email} but no matching auth user was found via listUsers — treating as an unexpected error.`
      );
      return NextResponse.json({ error: "Failed to create student account" }, { status: 500 });
    }

    const orphanedProfile = await prisma.studentProfile.findUnique({
      where: { supabaseUserId: existingAuthUser.id },
    });
    if (orphanedProfile) {
      return NextResponse.json(
        { error: "A student with this email already exists." },
        { status: 409 }
      );
    }

    console.warn(
      `[admin/students] Adopting orphaned Supabase auth user (id: ${existingAuthUser.id}, email: ${email}) — ` +
        "no StudentProfile referenced it. This usually means a previous registration attempt for this " +
        "email failed after the auth user was created but before (or during) its cleanup. If this " +
        "happens often, check server logs around deleteSupabaseUser failures."
    );
    adoptedExistingAuthUser = true;

    try {
      invite = await generateStudentInviteLink(email, redirectTo);
    } catch {
      // The orphaned user turned out to already be confirmed (a real,
      // active account with no profile — unusual, but possible) — a
      // password-recovery link still gets them a working action link.
      try {
        invite = await generateStudentRecoveryLink(email, redirectTo);
      } catch (recoveryErr) {
        console.error(
          "[admin/students] Failed to generate a link for orphaned auth user during adoption:",
          recoveryErr
        );
        return NextResponse.json({ error: "Failed to create student account" }, { status: 500 });
      }
    }
  }

  let student;
  try {
    student = await prisma.studentProfile.create({
      data: {
        supabaseUserId: invite.supabaseUserId,
        email,
        fullName,
        phone: phone || null,
        level: level || null,
        enrollmentDate: new Date(enrollmentDate),
        status,
        notes: notes || null,
        locale,
      },
    });
  } catch (err) {
    if (adoptedExistingAuthUser) {
      // Never delete a pre-existing auth user we merely adopted — we didn't
      // create it in this request, so cleaning it up isn't ours to do.
      console.error(
        `[admin/students] Failed to create StudentProfile for adopted auth user ${invite.supabaseUserId} ` +
          `(email: ${email}). The Supabase user was NOT deleted (it pre-existed this request) — retry by ` +
          "adding this student again once the underlying issue is fixed.",
        err
      );
    } else {
      // The Supabase user now exists but has no StudentProfile — clean it up
      // so the admin can retry with the same email instead of being
      // permanently stuck.
      await deleteSupabaseUser(invite.supabaseUserId);
      console.error(
        "[admin/students] Failed to create StudentProfile, rolled back Supabase user:",
        err
      );
    }
    return NextResponse.json({ error: "Failed to create student profile" }, { status: 500 });
  }

  // The student record is already saved at this point — an email failure
  // must never roll that back. notifyStudentInvite never throws (sendEmail
  // catches both thrown and API-level Resend failures internally), so no
  // try/catch is needed here — its result just needs to be surfaced.
  const emailResult = await notificationService.notifyStudentInvite(
    email,
    fullName,
    invite.actionLink,
    locale
  );

  return NextResponse.json({
    ok: true,
    student,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.error,
  });
}
