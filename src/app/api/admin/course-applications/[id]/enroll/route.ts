import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/dal";
import { preparationErrorResponse } from "@/lib/courses/admin-response";
import { createEnrollmentAndInitialPayment } from "@/lib/courses/create-enrollment";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  try {
    const result = await createEnrollmentAndInitialPayment((await params).id, await request.json());
    return NextResponse.json({ result });
  } catch (error) {
    return preparationErrorResponse(error);
  }
}
