import { createSupabaseServerClient } from "@/lib/supabase-server";

export interface StudentAuthUser {
  supabaseUserId: string;
  email: string;
}

/**
 * Reads the Supabase Auth session from cookies and asks Supabase's Auth
 * server to revalidate it (supabase.auth.getUser(), never getSession() —
 * getSession() only decodes the local cookie and can be spoofed if someone
 * tampers with it directly; getUser() is Supabase's documented safe check
 * for authorization decisions). This is the Supabase-Auth equivalent of
 * decryptSession()/readAdminSessionFromCookies() for the custom admin JWT —
 * the token itself is just verified by Supabase instead of a locally-held
 * secret.
 *
 * NOTE — this duplicates the getUser() call src/proxy.ts already made on the
 * same request. That's deliberate: this is the real, DB-connected check
 * (see verifyStudentSession in dal.ts), and re-verifying the JWT fresh here
 * rather than trusting anything the proxy forwarded is a conscious choice,
 * not an unnoticed cost — see the long comment in proxy.ts before changing
 * either side of this.
 */
export async function readStudentAuthUser(): Promise<StudentAuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !user.email) return null;

  return { supabaseUserId: user.id, email: user.email };
}
