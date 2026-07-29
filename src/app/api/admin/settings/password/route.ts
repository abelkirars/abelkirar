import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { verifyPassword, hashPassword } from "@/lib/admin/password";
import { createAdminSession } from "@/lib/admin/session";
import { checkRateLimit } from "@/lib/rate-limit";

// This endpoint accepts a guess at the CURRENT password behind an already-
// valid session — brute-forceable the same way a login form is, just with a
// smaller attacker population (whoever holds a valid admin_session cookie).
// Keyed by adminId, not IP: the session is the resource being protected
// here, not a particular network address. Same order of magnitude as the
// unauthenticated login rate limit (8/10min), with a slightly longer window
// since this guards an account-security action.
const CHANGE_PASSWORD_LIMIT = 8;
const CHANGE_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

const MIN_LENGTH = 12;

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
  confirmPassword: z.string().min(1),
});

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const allowed = await checkRateLimit(`admin-change-password:${auth.session.adminId}`, {
    limit: CHANGE_PASSWORD_LIMIT,
    windowMs: CHANGE_PASSWORD_WINDOW_MS,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { currentPassword, newPassword, confirmPassword } = parsed.data;

  if (newPassword.length < MIN_LENGTH) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_LENGTH} characters.` },
      { status: 400 }
    );
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "New passwords do not match." }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from the current password." },
      { status: 400 }
    );
  }

  // Identity comes ONLY from the session (auth.session.adminId) — the
  // request body is never trusted for who to update, so a tampered body
  // (a different admin id/username) cannot redirect this to another row.
  const admin = await prisma.admin.findUnique({ where: { id: auth.session.adminId } });
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentPasswordValid = await verifyPassword(currentPassword, admin.passwordHash);
  if (!currentPasswordValid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const passwordHash = await hashPassword(newPassword);
  // Truncated to whole seconds to match the JWT `iat` claim's native
  // second-granularity — see the doc comment on Admin.passwordChangedAt and
  // verifyAdminSession() for why this avoids a same-second comparison race
  // with the freshly-reissued session token below.
  const passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);

  await prisma.admin.update({
    where: { id: admin.id },
    data: { passwordHash, passwordChangedAt },
  });

  // Reissue the CURRENT session with a fresh token so this device stays
  // logged in — every other existing token now fails verifyAdminSession()'s
  // passwordChangedAt check on its next request.
  await createAdminSession({
    adminId: admin.id,
    username: admin.username,
    displayName: admin.displayName,
  });

  return NextResponse.json({ ok: true, otherSessionsInvalidated: true });
}
