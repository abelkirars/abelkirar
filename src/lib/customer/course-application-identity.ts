import "server-only";

import { cookies } from "next/headers";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CustomerEmailNotVerifiedError, verifiedIdentityFromUser } from "./dal";

export class CourseApplicationIdentityError extends Error {
  constructor(public readonly status: 401 | 403 | 503, message: string) {
    super(message);
  }
}

/** Existing accounts only. Null means a genuine guest, never failed Auth.
 * Cookie presence is only a fail-closed signal, NOT proof of identity. Snapshot
 * it before getUser can clear an invalid/expired session. Supabase SSR uses
 * sb-<project>-auth-token, optionally split into numbered chunks; the separate
 * PKCE code-verifier cookie is not a signed-in session.
 */
export async function resolveCourseApplicationCustomerId(request: Request): Promise<string | null> {
  const cookieStore = await cookies();
  const hasSessionCookie = cookieStore.getAll().some(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
  // This browser endpoint authenticates through the existing cookie-based
  // server client, not a client-provided Authorization header.
  if (request.headers.has("authorization")) {
    throw new CourseApplicationIdentityError(401, "Sign in with a verified account before submitting");
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (!user && isAuthSessionMissingError(error) && !hasSessionCookie) return null;
    if (error && (error.status === 0 || (error.status ?? 0) >= 500)) {
      throw new CourseApplicationIdentityError(503, "Account verification unavailable. Please try again later");
    }
    throw new CourseApplicationIdentityError(401, "Sign in with a verified account before submitting");
  }

  let identity;
  try {
    identity = verifiedIdentityFromUser(user);
  } catch (error) {
    if (!(error instanceof CustomerEmailNotVerifiedError)) throw error;
    throw new CourseApplicationIdentityError(401, "A verified email address is required");
  }
  const customer = await prisma.customer.findUnique({
    where: { supabaseUserId: identity.supabaseUserId },
    select: { id: true, status: true, archivedAt: true, deactivatedAt: true },
  });
  if (!customer || customer.status !== "ACTIVE" || customer.archivedAt || customer.deactivatedAt) {
    throw new CourseApplicationIdentityError(403, "An existing active customer account is required");
  }
  return customer.id;
}
