import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Mirrors POST /api/admin/logout exactly. Reuses the same sign-out call
// requireStudentPage() already makes in its orphaned/inactive cleanup path
// (src/lib/student/dal.ts) — no parallel logout mechanism. No auth guard,
// same as admin logout: ending a session that may already be gone is a
// safe no-op, not a privileged action.
export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
