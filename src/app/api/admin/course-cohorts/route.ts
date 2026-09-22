import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/dal";
import { createCohort } from "@/lib/courses/cohorts";
import { preparationErrorResponse } from "@/lib/courses/admin-response";
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  try { return NextResponse.json({ cohort: await createCohort(await request.json()) }); }
  catch (error) { return preparationErrorResponse(error); }
}
