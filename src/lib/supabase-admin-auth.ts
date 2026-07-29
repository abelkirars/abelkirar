import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Thrown for expected, admin-facing conflicts (e.g. an account already
 * exists) — callers can show `.message` directly. Anything else (network
 * failure, misconfiguration) should be treated as an unexpected error.
 */
export class StudentInviteError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
  }
}

/**
 * Creates a Supabase Auth user and returns an invite action link to deliver
 * ourselves (via Resend) — Supabase never sends anything for this call.
 *
 * Per @supabase/auth-js's own doc comment on generateLink(): "handles the
 * creation of the user for signup, invite and magiclink" — so a separate
 * admin.createUser() call is unnecessary here and would just conflict with
 * the user generateLink() itself creates. Calling this again for an email
 * that already has an unconfirmed (not-yet-set-password) account simply
 * regenerates a fresh link for that same user — this is also what powers
 * "Resend invite".
 *
 * The action_link/hashed_token/email_otp are never logged — only ever
 * threaded straight into the invite email body.
 */
export async function generateStudentInviteLink(
  email: string,
  redirectTo: string
): Promise<{ actionLink: string; supabaseUserId: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });

  if (error || !data?.user) {
    if (error?.code === "email_exists") {
      throw new StudentInviteError(
        "An account already exists for this email address.",
        error.code
      );
    }
    throw new StudentInviteError(error?.message ?? "Failed to generate invite link");
  }

  return { actionLink: data.properties.action_link, supabaseUserId: data.user.id };
}

/**
 * Fallback for adopting an orphaned auth user that's already confirmed (so
 * a fresh "invite" link is refused) — generates a password-recovery link
 * instead, which still gets them a working action link.
 */
export async function generateStudentRecoveryLink(
  email: string,
  redirectTo: string
): Promise<{ actionLink: string; supabaseUserId: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error || !data?.user) {
    throw new StudentInviteError(error?.message ?? "Failed to generate recovery link");
  }

  return { actionLink: data.properties.action_link, supabaseUserId: data.user.id };
}

/**
 * Cleanup for when a Supabase Auth user was created (via generateStudentInviteLink)
 * but the follow-up Prisma StudentProfile insert failed — without this, the
 * admin could never retry registration with the same email again. Never
 * throws; a cleanup failure is logged so it can be handled manually, but
 * must not mask the original error that triggered it. Only ever call this
 * for a user we just created ourselves in the same request — never for an
 * adopted pre-existing orphan (see route.ts).
 */
export async function deleteSupabaseUser(supabaseUserId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
  if (error) {
    console.error(
      `[student-invite] Failed to clean up orphaned Supabase user ${supabaseUserId}: ${error.message}. ` +
        `This user may need to be deleted manually via the Supabase dashboard before this email can be retried.`
    );
  }
}

/**
 * Finds a Supabase Auth user by email. The Admin API has no server-side
 * email filter on listUsers(), so this pages through the user list looking
 * for a match — only used on the rare "email_exists but we don't have an id"
 * path (see route.ts), never on a hot path, and bounded so a pathological
 * user count can't hang a request.
 */
export async function findSupabaseUserByEmail(
  email: string
): Promise<{ id: string; emailConfirmedAt: string | null } | null> {
  const normalized = email.toLowerCase();
  const PER_PAGE = 200;
  const MAX_PAGES = 20; // 4,000 users — comfortably beyond this school's scale

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error(`[student-invite] listUsers failed while searching for ${email}:`, error.message);
      return null;
    }
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) {
      return { id: match.id, emailConfirmedAt: match.email_confirmed_at ?? null };
    }
    if (data.users.length < PER_PAGE) break; // reached the last page
  }

  return null;
}
