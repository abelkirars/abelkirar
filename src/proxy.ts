import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSession, ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin/session";

/**
 * Optimistic redirect only — this just checks the session cookie's
 * signature/expiry so unauthenticated visitors bounce to /admin/login
 * immediately. It intentionally does NOT hit the database (Proxy should stay
 * fast), so every admin page and /api/admin/* route handler still performs
 * its own real auth check (see src/lib/admin/dal.ts) before touching data.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = await decryptSession(token);

  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
