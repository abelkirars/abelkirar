import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readAdminSessionFromCookies, type AdminSessionPayload } from "@/lib/admin/session";

/**
 * Verifies the session cookie AND that the admin account still exists and is
 * active, so a deactivated admin is locked out immediately rather than only
 * after their token expires. Memoized per request via React's cache().
 */
export const verifyAdminSession = cache(async (): Promise<AdminSessionPayload | null> => {
  const session = await readAdminSessionFromCookies();
  if (!session) return null;

  const admin = await prisma.admin.findUnique({ where: { id: session.adminId } });
  if (!admin || !admin.isActive) return null;

  return session;
});

/** For Server Component pages under /admin — redirects to login if unauthenticated. */
export async function requireAdminPage(): Promise<AdminSessionPayload> {
  const session = await verifyAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  return session;
}

/** For Route Handlers under /api/admin — returns a 401 response instead of redirecting. */
export async function requireAdminApi(): Promise<
  { session: AdminSessionPayload } | { response: NextResponse }
> {
  const session = await verifyAdminSession();
  if (!session) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session };
}
