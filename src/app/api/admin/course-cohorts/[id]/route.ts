import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/dal";
import { configureCohort, openCohort } from "@/lib/courses/cohorts";
import { preparationErrorResponse } from "@/lib/courses/admin-response";
import { z } from "zod";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();
    if (body.action === "OPEN") {
      z.object({ action: z.literal("OPEN") }).strict().parse(body);
      return NextResponse.json({ cohort: await openCohort(id) });
    }
    return NextResponse.json({ cohort: await configureCohort(id, body) });
  } catch (error) { return preparationErrorResponse(error); }
}
