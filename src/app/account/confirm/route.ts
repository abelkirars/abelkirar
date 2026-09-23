import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
/** Existing Supabase PKCE cookie verifier, not an invented token or identity. */
export async function GET(request: Request) {
  const url = new URL(request.url), code = url.searchParams.get("code");
  if (code && code.length <= 2048) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Authoritative user fetch, not the redirect URL or an unverified token.
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (!userError && user?.email && user.email_confirmed_at && Number.isFinite(Date.parse(user.email_confirmed_at))) {
          return NextResponse.redirect(new URL("/account", url), { headers });
        }
      }
    } catch { /* No tokens or provider error details in responses or logs. */ }
  }
  return NextResponse.redirect(new URL("/account/login?confirmation=failed", url), { headers });
}
export function HEAD() { return new Response(null, { status: 405, headers: { ...headers, Allow: "GET" } }); }
