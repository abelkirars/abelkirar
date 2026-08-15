import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { studentNoteSchema } from "@/lib/validations/student-note";

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
  const parsed = studentNoteSchema.safeParse({
    body: formData.get("body"),
    visibleToStudent: formData.get("visibleToStudent"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // weeklyPracticeId is deliberately not offered here — "Create a note for
  // that student" was the ask, not "attach to an assignment." Nothing
  // prevents adding that later if it's actually needed.
  const note = await prisma.studentNote.create({
    data: {
      studentId,
      body: parsed.data.body,
      visibleToStudent: parsed.data.visibleToStudent,
    },
  });

  return NextResponse.json({ ok: true, note });
}
