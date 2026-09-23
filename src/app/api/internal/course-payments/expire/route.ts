import { schedulerAuthorized } from "@/lib/courses/scheduler-auth";
import { runInitialPaymentExpirationJob } from "@/lib/courses/expiration-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

// Vercel Cron invokes GET. Cookie/customer/admin authentication is NOT accepted.
export async function GET(request: Request) {
  if (!schedulerAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (new URL(request.url).search) return Response.json({ error: "Parameters are not supported" }, { status: 400, headers });
  try {
    const result = await runInitialPaymentExpirationJob();
    return Response.json(result, { status: result.failed ? 503 : 200, headers });
  } catch { return Response.json({ error: "Expiration job unavailable" }, { status: 503, headers }); }
}

// Do not let Next's automatic HEAD fallback execute a mutating GET handler.
export function HEAD() { return new Response(null, { status: 405, headers: { ...headers, Allow: "GET" } }); }
