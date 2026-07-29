import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readStudentAuthUser } from "@/lib/student/session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export interface StudentSessionPayload {
  /** StudentProfile.id — the only student identifier any route/query should ever use. */
  studentId: string;
  supabaseUserId: string;
  email: string;
  fullName: string;
  locale: string;
}

export type StudentSessionResolution =
  | { kind: "unauthenticated" }
  /** A valid Supabase session exists but no StudentProfile row matches it —
   *  an operational anomaly (e.g. the profile was deleted directly, or
   *  account creation partially failed), not a normal "wrong credentials"
   *  case. */
  | { kind: "orphaned" }
  /** A valid Supabase session exists and the StudentProfile does too, but
   *  it's been deactivated. Unlike "unauthenticated", this person IS already
   *  authenticated as themselves — telling them their own account is
   *  inactive leaks nothing to a third party (the enumeration risk that
   *  justifies a generic message only applies to someone who isn't
   *  authenticated yet). Leaving them signed into Supabase instead would
   *  mean their session stays valid indefinitely, every request keeps
   *  burning a DB lookup, and once /student/login gets its standard
   *  "already authenticated -> redirect to dashboard" check, they'd loop:
   *  dashboard -> login -> dashboard. So this is handled exactly like
   *  "orphaned" — sign out, then redirect with a distinct error state. */
  | { kind: "inactive" }
  | { kind: "active"; session: StudentSessionPayload };

/**
 * Verifies the Supabase Auth session AND that the linked StudentProfile
 * still exists and is ACTIVE, re-checked against the DB on every request —
 * the same pattern verifyAdminSession uses for Admin.isActive, never trusted
 * from the token alone. Memoized per request via React's cache().
 */
/**
 * Exported (not just used internally by requireStudentPage/requireStudentApi
 * below) so /student/login can peek at whether there's already a fully
 * valid, active session — WITHOUT redirecting — to decide whether to show
 * the form at all. Only an "active" result should trigger that redirect;
 * orphaned/inactive must not, or a still-Supabase-authenticated-but-blocked
 * visitor could never even reach the login form to see their error banner.
 */
export const resolveStudentSession = cache(async (): Promise<StudentSessionResolution> => {
  const authUser = await readStudentAuthUser();
  if (!authUser) return { kind: "unauthenticated" };

  const profile = await prisma.studentProfile.findUnique({
    where: { supabaseUserId: authUser.supabaseUserId },
  });

  if (!profile) return { kind: "orphaned" };
  if (profile.status !== "ACTIVE") return { kind: "inactive" };

  return {
    kind: "active",
    session: {
      studentId: profile.id,
      supabaseUserId: profile.supabaseUserId,
      email: profile.email,
      fullName: profile.fullName,
      locale: profile.locale,
    },
  };
});

/** For Server Component pages under /student — redirects to login if unauthenticated/inactive/orphaned. */
export async function requireStudentPage(): Promise<StudentSessionPayload> {
  const result = await resolveStudentSession();

  if (result.kind === "active") return result.session;

  if (result.kind === "orphaned" || result.kind === "inactive") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    const errorState = result.kind === "orphaned" ? "account-not-found" : "account-inactive";
    redirect(`/student/login?error=${errorState}`);
  }

  // Only genuinely unauthenticated visitors get the plain, no-error redirect
  // — nothing to leak to someone who was never signed in.
  redirect("/student/login");
}

/** For Route Handlers under /api/student — returns a 401 response instead of redirecting. */
export async function requireStudentApi(): Promise<
  { session: StudentSessionPayload } | { response: NextResponse }
> {
  const result = await resolveStudentSession();

  if (result.kind === "active") return { session: result.session };

  if (result.kind === "orphaned") {
    return {
      response: NextResponse.json({ error: "Account not found" }, { status: 401 }),
    };
  }

  if (result.kind === "inactive") {
    return {
      response: NextResponse.json({ error: "Account inactive" }, { status: 401 }),
    };
  }

  return {
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}
