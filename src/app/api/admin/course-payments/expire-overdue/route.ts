import { requireAdminApi } from "@/lib/admin/dal";
import { runInitialPaymentExpirationJob } from "@/lib/courses/expiration-job";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

/** Deliberate operator fallback; same bounded service, no arbitrary jobs/IDs. */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403, headers });
  try {
    const body = await request.json();
    if (!body || body.confirmation !== true || Object.keys(body).length !== 1 || new URL(request.url).search) {
      return Response.json({ error: "Explicit confirmation only is required" }, { status: 400, headers });
    }
  } catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers }); }
  try {
    const result = await runInitialPaymentExpirationJob();
    return Response.json(result, { status: result.failed ? 503 : 200, headers });
  } catch { return Response.json({ error: "Expiration job unavailable" }, { status: 503, headers }); }
}
