import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateStudentRecoveryLink } from "@/lib/supabase-admin-auth";
import { notificationService } from "@/lib/notifications";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

const bodySchema = z.object({ email: z.email() });

// Two independent windows: per-email stops repeated probing/spamming of one
// address, per-IP stops one source from sweeping many addresses. Generous
// enough for a genuinely forgetful student to retry a few times.
const EMAIL_LIMIT = 5;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const IP_LIMIT = 20;
const IP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Reachable by anyone, unauthenticated — must never reveal whether a given
 * email is a registered student. Every path that doesn't hit a rate limit
 * returns the exact same response, regardless of whether the email exists,
 * is active, or the send itself failed.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const { email } = parsed.data;

  const ip = clientIpFrom(request);
  const [emailAllowed, ipAllowed] = await Promise.all([
    checkRateLimit(`student-forgot-password:email:${email}`, {
      limit: EMAIL_LIMIT,
      windowMs: EMAIL_WINDOW_MS,
    }),
    checkRateLimit(`student-forgot-password:ip:${ip}`, { limit: IP_LIMIT, windowMs: IP_WINDOW_MS }),
  ]);
  if (!emailAllowed || !ipAllowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const student = await prisma.studentProfile.findUnique({ where: { email } });

  // Silently no-op for a nonexistent or deactivated account — the response
  // is identical either way, so this never leaks which case it was. A
  // deactivated student's link would be rejected by /api/student/set-password
  // anyway, so sending one would serve no purpose.
  if (student && student.status === "ACTIVE") {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;
      const { actionLink } = await generateStudentRecoveryLink(
        email,
        `${siteUrl}/student/set-password`
      );
      await notificationService.notifyStudentPasswordReset(
        email,
        student.fullName,
        actionLink,
        student.locale
      );
    } catch (err) {
      console.error("[student/forgot-password] Failed to send recovery link:", err);
      // Fall through to the same generic response — never surfaced to the caller.
    }
  }

  return NextResponse.json({ ok: true });
}
