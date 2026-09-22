import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/dal";
import { prepareEnrollment } from "@/lib/courses/prepare-enrollment";
import { preparationErrorResponse } from "@/lib/courses/admin-response";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  try { return NextResponse.json({ summary: await prepareEnrollment((await params).id, await request.json()) }); }
  catch (error) { return preparationErrorResponse(error); }
}
