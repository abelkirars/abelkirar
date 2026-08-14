import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { weeklyPracticeSchema } from "@/lib/validations/weekly-practice";

/** Sunday of the same week as a validated "YYYY-MM-DD" Monday, as a Date. */
function computeWeekEndDate(weekStartDate: string): Date {
  const end = new Date(`${weekStartDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId } = await params;
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const parsed = weeklyPracticeSchema.safeParse({
    weekTitle: formData.get("weekTitle"),
    weekStartDate: formData.get("weekStartDate"),
    instructions: formData.get("instructions") || undefined,
    goals: formData.get("goals") || undefined,
    recordingRequired: formData.get("recordingRequired"),
    internalCurriculumRef: formData.get("internalCurriculumRef") || undefined,
    currentTechnique: formData.get("currentTechnique") || undefined,
    teacherNotes: formData.get("teacherNotes") || undefined,
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
  } = parsed.data;

  const weeklyPractice = await prisma.weeklyPractice.create({
    data: {
      studentId,
      weekTitle,
      weekStartDate: new Date(`${weekStartDate}T00:00:00Z`),
      weekEndDate: computeWeekEndDate(weekStartDate),
      instructions: instructions || null,
      goals: goals || null,
      recordingRequired,
      internalCurriculumRef: internalCurriculumRef || null,
      currentTechnique: currentTechnique || null,
      teacherNotes: teacherNotes || null,
      // Always the schema default on creation — this form offers no status
      // choice at create time, deliberately (see weekly-practice.ts).
      status: "NOT_STARTED",
      // The relation existed and was unused before this stage; "who
      // authored this" should never be unanswerable.
      createdById: auth.session.adminId,
    },
  });

  return NextResponse.json({ ok: true, weeklyPractice });
}
