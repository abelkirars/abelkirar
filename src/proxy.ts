import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { decryptSession, ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin/session";

/**
 * Optimistic redirect only, for both /admin and /student — this just checks
 * session validity so an unauthenticated visitor bounces to the right login
 * page immediately. It intentionally never touches our own Postgres database
 * (Proxy should stay fast), so every admin/student page and every
 * /api/admin/* or /api/student/* route handler still performs its own real
 * auth check before touching data:
 *   - admin: requireAdminPage/requireAdminApi (src/lib/admin/dal.ts) —
 *     re-checks Admin.isActive against the DB.
 *   - student: requireStudentPage/requireStudentApi (src/lib/student/dal.ts) —
 *     re-checks StudentProfile.status === ACTIVE against the DB.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    return handleAdminRoute(request, pathname);
  }

  if (pathname.startsWith("/student")) {
    return handleStudentRoute(request, pathname);
  }

  return NextResponse.next();
}

async function handleAdminRoute(request: NextRequest, pathname: string) {
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

// Public, unauthenticated student-facing routes — must be excluded from the
// session check below, or the proxy would redirect an already-authenticated
// visitor away from /student/login before they could even see it (and an
// unauthenticated one visiting /student/set-password from an invite link
// would bounce to /student/login, which is also wrong: that page must be
// reachable without an existing session). Exact-match, not prefix, so
// nothing under these paths is accidentally made public by a future rename.
const PUBLIC_STUDENT_PATHS = new Set([
  "/student/login",
  "/student/set-password",
  "/student/forgot-password",
]);

async function handleStudentRoute(request: NextRequest, pathname: string) {
  if (PUBLIC_STUDENT_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Supabase's session-refresh cookie dance: reads/writes must go through
  // the same request/response pair so a refreshed token is actually
  // persisted for the page render that follows this proxy call. `response`
  // is reassigned (not mutated) inside setAll, but because it's a `let`
  // binding captured by reference, the `return response` at the bottom of
  // this function always sees whatever setAll last assigned — the object
  // with the refreshed cookies actually attached, never the stale
  // placeholder. This assumes setAll is called at most once per request
  // (it is, in practice — @supabase/ssr sends the full cookie list in one
  // call); if that ever changed, only the last call's cookies would survive.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // DELIBERATE DUPLICATE NETWORK CALL — do not remove.
  // getUser() always makes a network round-trip to Supabase's Auth server
  // (that's what makes it safe to trust, unlike the local-only getSession());
  // requireStudentPage/requireStudentApi call it again via readStudentAuthUser()
  // for the real per-route check, so every protected /student/* request pays
  // this cost twice. That duplication is intentional, not an oversight:
  //   - This call exists ONLY so a refreshed token can be persisted via
  //     setAll() above. Server Components cannot write cookies in Next.js —
  //     middleware/Proxy is the only place that can — so this call cannot be
  //     deleted without breaking token refresh (silent, hard-to-diagnose
  //     random logouts once the old token expires).
  //   - It is also intentionally NOT reused by the DAL via a header the proxy
  //     sets: that would mean trusting forwarded identity instead of a fresh,
  //     cryptographically re-verified check at the point of the actual
  //     authorization decision — the same trust boundary Supabase's own SDK
  //     docs warn about for cookies/headers ("must not be trusted... always
  //     verify the JWT"). We were not confident enough in Next.js's
  //     header-passthrough/caching guarantees across all deployment
  //     configurations to accept that risk for student data access. If this
  //     ever gets revisited, it needs a from-scratch safety review, not a
  //     quick edit.
  // This check here is signature/expiry only — never queries StudentProfile,
  // so a deactivated-but-still-Supabase-logged-in student still passes this
  // step. The real block for that case (and for an authenticated user with
  // no matching StudentProfile row at all) is requireStudentPage/requireStudentApi.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Carry over any cookies setAll already wrote (e.g. a refresh that
    // succeeded on an otherwise-invalid request) — redirecting via a brand
    // new NextResponse would silently drop them.
    const redirectResponse = NextResponse.redirect(new URL("/student/login", request.url));
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/student/:path*"],
};
