import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { studentNoteSchema } from "@/lib/validations/student-note";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ studentId: string; noteId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId, noteId } = await params;
  const existing = await prisma.studentNote.findUnique({ where: { id: noteId } });
  if (!existing || existing.studentId !== studentId) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const parsed = studentNoteSchema.safeParse({
    body: formData.get("body") ?? existing.body,
    visibleToStudent: formData.has("visibleToStudent")
      ? formData.get("visibleToStudent")
      : existing.visibleToStudent,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const note = await prisma.studentNote.update({
    where: { id: noteId },
    data: { body: parsed.data.body, visibleToStudent: parsed.data.visibleToStudent },
  });

  return NextResponse.json({ ok: true, note });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ studentId: string; noteId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId, noteId } = await params;
  const existing = await prisma.studentNote.findUnique({ where: { id: noteId } });
  if (!existing || existing.studentId !== studentId) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  await prisma.studentNote.delete({ where: { id: noteId } });
  return NextResponse.json({ ok: true });
}
