import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase Auth client (anon key — RLS/auth-scoped, not the
 * service role) for use in Server Components, Route Handlers, and Server
 * Actions under /student and /api/student. Always create a fresh instance
 * per request; never share one across requests.
 *
 * setAll can throw when called from a Server Component render (cookies are
 * read-only there) — safe to ignore since the proxy (src/proxy.ts) already
 * refreshes the session cookie on every /student/:path* request.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — ignored, see doc comment above.
          }
        },
      },
    }
  );
}
