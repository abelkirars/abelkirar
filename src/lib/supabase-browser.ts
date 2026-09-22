import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase Auth client (anon key only — never the service role
 * key). Used by the student portal and authenticated customer payment pages.
 * Create a new instance per component that needs it
 * (cheap — @supabase/ssr reuses the underlying connection).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  );
}
