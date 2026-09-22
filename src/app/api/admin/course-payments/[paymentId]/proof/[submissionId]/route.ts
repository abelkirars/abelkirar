import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/dal";
import { getAdminCourseProofUrl } from "@/lib/courses/admin-payments";

export async function GET(request: Request, { params }: { params: Promise<{ paymentId: string; submissionId: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  if (new URL(request.url).search) return NextResponse.json({ error: "Proof path parameters are not accepted" }, { status: 400 });
  const { paymentId, submissionId } = await params;
  const url = await getAdminCourseProofUrl(paymentId, submissionId);
  if (!url) return NextResponse.json({ error: "Proof unavailable" }, { status: 404 });
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
