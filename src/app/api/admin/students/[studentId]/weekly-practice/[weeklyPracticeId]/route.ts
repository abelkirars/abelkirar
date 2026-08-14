import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import {
  weeklyPracticeSchema,
  WEEKLY_PRACTICE_ADMIN_STATUSES,
} from "@/lib/validations/weekly-practice";

/** Sunday of the same week as a validated "YYYY-MM-DD" Monday, as a Date. */
function computeWeekEndDate(weekStartDate: string): Date {
  const end = new Date(`${weekStartDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ studentId: string; weeklyPracticeId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId, weeklyPracticeId } = await params;
  const existing = await prisma.weeklyPractice.findUnique({ where: { id: weeklyPracticeId } });
  if (!existing || existing.studentId !== studentId) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const parsed = weeklyPracticeSchema.safeParse({
    weekTitle: formData.get("weekTitle") ?? existing.weekTitle,
    weekStartDate:
      formData.get("weekStartDate") ?? existing.weekStartDate.toISOString().slice(0, 10),
    instructions: formData.get("instructions") ?? existing.instructions ?? undefined,
    goals: formData.get("goals") ?? existing.goals ?? undefined,
    recordingRequired: formData.has("recordingRequired")
      ? formData.get("recordingRequired")
      : existing.recordingRequired,
    internalCurriculumRef:
      formData.get("internalCurriculumRef") ?? existing.internalCurriculumRef ?? undefined,
    currentTechnique: formData.get("currentTechnique") ?? existing.currentTechnique ?? undefined,
    teacherNotes: formData.get("teacherNotes") ?? existing.teacherNotes ?? undefined,
    status: formData.get("status") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const {
    weekTitle,
    weekStartDate,
    instructions,
    goals,
    recordingRequired,
    internalCurriculumRef,
    currentTechnique,
    teacherNotes,
    status,
  } = parsed.data;

  // Server-side backstop matching the form's own UI restriction: a row
  // already in a system-owned status (SUBMITTED/REVIEWED/COMPLETED) can
  // never have its status changed through this route, even if a request
  // bypassed the form — only NOT_STARTED/IN_PROGRESS/MISSED rows are
  // admin-editable here.
  const canEditStatus = (WEEKLY_PRACTICE_ADMIN_STATUSES as readonly string[]).includes(
    existing.status
  );

  const weeklyPractice = await prisma.weeklyPractice.update({
    where: { id: weeklyPracticeId },
    data: {
      weekTitle,
      weekStartDate: new Date(`${weekStartDate}T00:00:00Z`),
      weekEndDate: computeWeekEndDate(weekStartDate),
      instructions: instructions || null,
      goals: goals || null,
      recordingRequired,
      internalCurriculumRef: internalCurriculumRef || null,
      currentTechnique: currentTechnique || null,
      teacherNotes: teacherNotes || null,
      ...(canEditStatus && status ? { status } : {}),
    },
  });

  return NextResponse.json({ ok: true, weeklyPractice });
}
