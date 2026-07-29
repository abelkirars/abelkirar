import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const bodySchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  password: z.string().min(8),
  confirmPassword: z.string().min(1),
});

/**
 * Deliberately does NOT start with requireStudentApi() like every other
 * /api/student/* route — there is no StudentProfile-backed session yet when
 * this request starts. The access_token/refresh_token this route receives
 * came straight from the URL hash fragment GoTrue's /auth/v1/verify redirect
 * produced (confirmed empirically during the Phase 2B investigation: both
 * invite and recovery links land with #access_token=...&refresh_token=...,
 * an implicit-grant shape, never a `code` or `token_hash` param) — the
 * browser can only read that fragment client-side (fragments never reach a
 * server on their own), so the client parses it and posts the tokens here in
 * one request. This handler establishes the session itself via setSession()
 * and re-derives the caller's identity from the resulting session — it is
 * the auth check for this route, not a bypass of one.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { access_token, refresh_token, password, confirmPassword } = parsed.data;

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "passwords_dont_match" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Establishes the session AND revalidates the tokens against Supabase's
  // Auth server in the same call (setSession calls _getUser() internally
  // when the access token isn't already expired) — this is the real,
  // network-verified check, not a local-only decode.
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessionError || !sessionData.session || !sessionData.user) {
    return NextResponse.json({ error: "invalid_or_expired_link" }, { status: 400 });
  }

  const student = await prisma.studentProfile.findUnique({
    where: { supabaseUserId: sessionData.user.id },
  });

  if (!student) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  }

  // Blocks a deactivated student from ever completing this flow — checked
  // BEFORE updateUser() below, so a deactivated account's Supabase password
  // is never actually changed via this route.
  if (student.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "account_inactive" }, { status: 403 });
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    if (updateError.code === "weak_password") {
      const reasons =
        "reasons" in updateError && Array.isArray(updateError.reasons)
          ? (updateError.reasons as string[])
          : [];
      return NextResponse.json(
        { error: "weak_password", reasons },
        { status: 400 }
      );
    }
    console.error("[student/set-password] updateUser failed:", updateError.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  // Only ever set once — a later password reset (via forgot-password, which
  // reuses this same route) must not disturb the original activation date.
  if (!student.activatedAt) {
    await prisma.studentProfile.update({
      where: { id: student.id },
      data: { activatedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
