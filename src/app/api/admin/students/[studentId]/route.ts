import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { studentSchema } from "@/lib/validations/student";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId } = await params;
  const existing = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!existing) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const formData = await request.formData();

  // The status-toggle action only sends `status`, so every other field
  // falls back to the existing row instead of failing validation on a
  // missing fullName/enrollmentDate.
  const parsed = studentSchema.safeParse({
    fullName: formData.get("fullName") ?? existing.fullName,
    email: formData.get("email") ?? existing.email,
    phone: formData.get("phone") ?? existing.phone ?? undefined,
    level: formData.get("level") ?? existing.level ?? undefined,
    enrollmentDate:
      formData.get("enrollmentDate") ?? existing.enrollmentDate?.toISOString().slice(0, 10),
    status: formData.has("status") ? formData.get("status") : existing.status,
    notes: formData.get("notes") ?? existing.notes ?? undefined,
    locale: formData.get("locale") ?? existing.locale,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Email is the Supabase Auth identity key (StudentProfile.supabaseUserId
  // was linked against it at invite time) — changing it here would desync
  // the two without also updating the Supabase user's email, so it's
  // rejected rather than silently accepted.
  if (parsed.data.email !== existing.email) {
    return NextResponse.json({ error: "Email cannot be changed here." }, { status: 400 });
  }

  const { fullName, phone, level, enrollmentDate, status, notes, locale } = parsed.data;

  const student = await prisma.studentProfile.update({
    where: { id: studentId },
    data: {
      fullName,
      phone: phone || null,
      level: level || null,
      enrollmentDate: new Date(enrollmentDate),
      status,
      notes: notes || null,
      locale,
    },
  });

  return NextResponse.json({ ok: true, student });
}
