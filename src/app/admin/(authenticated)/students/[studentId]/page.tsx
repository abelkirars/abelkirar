import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { Badge } from "@/components/ui/badge";
import { StudentForm } from "@/components/admin/student-form";
import { StudentStatusToggle } from "@/components/admin/student-status-toggle";
import { ResendInviteButton } from "@/components/admin/resend-invite-button";
import { StudentEmailCorrection } from "@/components/admin/student-email-correction";
import { WeeklyPracticeForm } from "@/components/admin/weekly-practice-form";
import { WeeklyPracticeRow } from "@/components/admin/weekly-practice-row";
import { StudentNoteForm } from "@/components/admin/student-note-form";
import { StudentNoteRow } from "@/components/admin/student-note-row";

export const dynamic = "force-dynamic";

export default async function AdminStudentProfilePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!student) notFound();

  // Admin side — no restrictive `select` needed or wanted here, unlike
  // src/lib/student/queries.ts. This page is allowed to see
  // teacherNotes/internalCurriculumRef/currentTechnique; that boundary is
  // specifically about the student-facing path, not this one.
  const weeklyPractices = await prisma.weeklyPractice.findMany({
    where: { studentId },
    orderBy: { weekStartDate: "desc" },
  });

  // Admin side — same as above, no restrictive select. Includes both
  // student-authored (via addMyNote) and teacher-authored notes; there is
  // no field yet distinguishing the two (see the report accompanying this
  // change), so this list simply shows every note for this student.
  const notes = await prisma.studentNote.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="py-10">
      <Container className="max-w-3xl">
        <Link href="/admin/students" className="text-sm text-muted-foreground hover:underline">
          ← Back to students
        </Link>

        <div className="mt-2 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{student.fullName}</h1>
            <p className="text-sm text-muted-foreground">{student.email}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant={student.status === "ACTIVE" ? "default" : "outline"}>
              {student.status === "ACTIVE" ? "Active" : "Inactive"}
            </Badge>
            <Badge variant={student.activatedAt ? "default" : "outline"}>
              {student.activatedAt
                ? `Activated ${student.activatedAt.toLocaleDateString()}`
                : "Not yet activated"}
            </Badge>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <StudentStatusToggle studentId={student.id} status={student.status} />
          <ResendInviteButton studentId={student.id} />
        </div>

        <div className="mt-4">
          <StudentEmailCorrection studentId={student.id} canChange={!student.activatedAt} />
        </div>

        <div className="mt-8 rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium">Edit details</h2>
          <StudentForm student={student} />
        </div>

        <div className="mt-8 rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium">Weekly assignments</h2>
          <WeeklyPracticeForm studentId={student.id} />

          <div className="mt-6 space-y-3">
            {weeklyPractices.map((weeklyPractice) => (
              <WeeklyPracticeRow
                key={weeklyPractice.id}
                studentId={student.id}
                weeklyPractice={weeklyPractice}
              />
            ))}
            {weeklyPractices.length === 0 && (
              <p className="py-4 text-center text-muted-foreground">No assignments yet.</p>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium">Notes</h2>
          <StudentNoteForm studentId={student.id} />

          <div className="mt-6 space-y-3">
            {notes.map((note) => (
              <StudentNoteRow key={note.id} studentId={student.id} note={note} />
            ))}
            {notes.length === 0 && (
              <p className="py-4 text-center text-muted-foreground">No notes yet.</p>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
