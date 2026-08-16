import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { assignMilestoneSchema } from "@/lib/validations/student-milestone";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId } = await params;

  const formData = await request.formData();
  const parsed = assignMilestoneSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { milestoneId } = parsed.data;

  // Confirm the milestone exists before creating anything — never assign a
  // nonexistent milestone.
  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }

  const studentMilestone = await prisma.studentMilestone.create({
    data: { studentId, milestoneId },
  });

  return NextResponse.json({ ok: true, studentMilestone });
}
