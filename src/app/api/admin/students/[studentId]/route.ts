import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { studentSchema } from "@/lib/validations/student";
import { deleteRecordingObjectOrThrow } from "@/lib/student-recordings";
import { deleteStudentAuthAccount } from "@/lib/supabase-admin-auth";

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

/**
 * Hard delete. Overrides the 2026-08-15 decision against this — see
 * docs/DECISIONS.md's correction entry for why. Guardrails (typed-name
 * confirmation, explicit "cannot be undone" copy) live in the admin UI,
 * not here; this route is the enforcement boundary and assumes nothing
 * about what called it.
 *
 * Order: recordings, then the Supabase Auth account, then the database —
 * deliberately, and the three steps are NOT interchangeable. The
 * StudentProfile row (with its storagePath-bearing children and its
 * supabaseUserId) is the one piece of information that says what still
 * needs cleaning up. As long as it exists, a storage or Auth failure is
 * recoverable — retry this route, or clean up by hand using what the row
 * still names. The database delete is the step with no way back: once it
 * succeeds, that information is gone. So it runs last, and only once
 * everything upstream is confirmed done — never before. Each earlier step
 * fails loudly and stops; nothing downstream of a failure is attempted.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { studentId } = await params;

  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { id: true, supabaseUserId: true, fullName: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // Collect every stored recording object BEFORE anything is deleted —
  // once the database step runs, these storagePath values are gone for
  // good, so this is the only chance to know what to remove.
  const attachments = await prisma.weeklyPracticeAttachment.findMany({
    where: { weeklyPractice: { studentId } },
    select: { storagePath: true },
  });

  // Step 1 — recordings. Sequential and stop-on-first-failure, not
  // Promise.all: "fail loudly and stop" means the next deletion must never
  // even start once one has failed. deleteRecordingObjectOrThrow is used
  // here specifically (not deleteRecordingObject, which is best-effort and
  // never throws by design for its own, different call site) because this
  // step must be able to gate everything after it.
  for (const attachment of attachments) {
    try {
      await deleteRecordingObjectOrThrow(attachment.storagePath);
    } catch (err) {
      console.error(
        `[admin/students/${studentId}] Failed to delete recording ${attachment.storagePath}. ` +
          `Nothing else was touched — the student record still names every recording.`,
        err
      );
      return NextResponse.json(
        { error: "Failed to delete a stored recording. Nothing was removed." },
        { status: 500 }
      );
    }
  }

  // Step 2 — the Supabase Auth account. Recordings are confirmed gone by
  // this point; the database row (and the supabaseUserId on it) still
  // exists, so a failure here is still recoverable the same way.
  try {
    await deleteStudentAuthAccount(student.supabaseUserId);
  } catch (err) {
    console.error(
      `[admin/students/${studentId}] Failed to delete the Supabase Auth account ` +
        `(${student.supabaseUserId}). Nothing in the database was touched.`,
      err
    );
    return NextResponse.json(
      { error: "Failed to delete the login account. Nothing was removed from the database." },
      { status: 500 }
    );
  }

  // Step 3 — the database, last, only once both steps above are confirmed
  // done. WeeklyPracticeAttachment rows are deleted explicitly here rather
  // than left to the schema's own ON DELETE CASCADE from WeeklyPractice —
  // both the schema and the applied migration SQL do declare that cascade
  // correctly (verified directly, not assumed), but this makes the
  // deletion of recording-related rows a visible line of code instead of
  // something implicit a reader has to go verify elsewhere. One
  // transaction so the two database statements succeed or fail together —
  // no state where attachment rows are gone but the profile row survives,
  // or vice versa.
  try {
    await prisma.$transaction([
      prisma.weeklyPracticeAttachment.deleteMany({
        where: { weeklyPractice: { studentId } },
      }),
      prisma.studentProfile.delete({ where: { id: studentId } }),
    ]);
  } catch (err) {
    console.error(
      `[admin/students/${studentId}] Recordings and the Auth account were removed, but the ` +
        `database delete failed. The student's data still exists in the database.`,
      err
    );
    return NextResponse.json(
      {
        error:
          "Recordings and the login account were removed, but the database delete failed. " +
          "The student's data was not removed — retry, or delete the remaining row manually.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
