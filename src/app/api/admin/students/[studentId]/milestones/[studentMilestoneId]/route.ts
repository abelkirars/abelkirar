import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { approveMilestoneSchema } from "@/lib/validations/student-milestone";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ studentId: string; studentMilestoneId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId, studentMilestoneId } = await params;

  const existing = await prisma.studentMilestone.findUnique({
    where: { id: studentMilestoneId },
  });
  if (!existing || existing.studentId !== studentId) {
    return NextResponse.json({ error: "Milestone assignment not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const parsed = approveMilestoneSchema.safeParse({
    teacherComment: formData.get("teacherComment") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { teacherComment } = parsed.data;

  const studentMilestone = await prisma.studentMilestone.update({
    where: { id: studentMilestoneId },
    data: {
      status: "ACHIEVED",
      achievedAt: new Date(),
      // From the authenticated session — never client-suppliable.
      signedOffById: auth.session.adminId,
      teacherComment: teacherComment || null,
    },
  });

  return NextResponse.json({ ok: true, studentMilestone });
}
