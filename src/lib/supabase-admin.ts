import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-only operations (private storage
 * buckets, admin-only signed URLs). Never import this from client code.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);
