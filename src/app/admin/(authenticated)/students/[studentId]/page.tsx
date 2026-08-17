import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { Badge } from "@/components/ui/badge";
import { StudentForm } from "@/components/admin/student-form";
import { StudentStatusToggle } from "@/components/admin/student-status-toggle";
import { ResendInviteButton } from "@/components/admin/resend-invite-button";
import { StudentEmailCorrection } from "@/components/admin/student-email-correction";
import { StudentDeleteButton } from "@/components/admin/student-delete-button";
import { WeeklyPracticeForm } from "@/components/admin/weekly-practice-form";
import { WeeklyPracticeRow } from "@/components/admin/weekly-practice-row";
import { StudentNoteForm } from "@/components/admin/student-note-form";
import { StudentNoteRow } from "@/components/admin/student-note-row";
import { StudentMilestoneAssignForm } from "@/components/admin/student-milestone-assign-form";
import { StudentMilestoneRow } from "@/components/admin/student-milestone-row";

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
  //
  // attachments IS restricted, deliberately: WeeklyPracticeRow (below) is a
  // "use client" component, so whatever this query returns for `attachments`
  // becomes a client-component prop. id + mimeType are all the player needs
  // to build a URL and pick video-vs-audio — storagePath must never be in
  // that list. The signed URL itself is minted on demand by the existing
  // admin route (.../recordings/[attachmentId]) when the browser requests
  // the player's src, never embedded here. uploadedBy: "STUDENT" excludes
  // any future admin-uploaded attachment from ever showing up mislabeled as
  // a student recording — no such row exists yet, but costs nothing to
  // exclude now.
  const weeklyPractices = await prisma.weeklyPractice.findMany({
    where: { studentId },
    orderBy: { weekStartDate: "desc" },
    include: {
      attachments: {
        where: { uploadedBy: "STUDENT" },
        select: { id: true, mimeType: true },
      },
    },
  });

  // Admin side — same as above, no restrictive select. Includes both
  // student-authored (via addMyNote) and teacher-authored notes; there is
  // no field yet distinguishing the two (see the report accompanying this
  // change), so this list simply shows every note for this student.
  const notes = await prisma.studentNote.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });

  // Admin side — full include is fine here (same boundary reasoning as
  // above); this never crosses into src/lib/student/queries.ts's path.
  const studentMilestones = await prisma.studentMilestone.findMany({
    where: { studentId },
    include: { milestone: true },
    orderBy: [{ milestone: { level: "asc" } }, { milestone: { sortOrder: "asc" } }],
  });

  // Only milestones at the student's own level, not already assigned to
  // them — assigning outside their level would just sit invisibly in the
  // progress denominator (getMyLevelProgress filters by level too), so
  // there's no reason to offer it here.
  const assignedMilestoneIds = new Set(studentMilestones.map((sm) => sm.milestoneId));
  const availableMilestones = student.level
    ? await prisma.milestone.findMany({
        where: {
          level: student.level,
          active: true,
          id: { notIn: [...assignedMilestoneIds] },
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true, label: true },
      })
    : [];

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

        <div className="mt-8 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div>
            <p className="text-sm font-medium text-destructive">Danger zone</p>
            <p className="text-sm text-muted-foreground">
              Permanently deletes this student and everything tied to their account.
            </p>
          </div>
          <StudentDeleteButton studentId={student.id} fullName={student.fullName} />
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
          <h2 className="mb-4 font-medium">Milestones</h2>
          {student.level ? (
            <StudentMilestoneAssignForm
              studentId={student.id}
              availableMilestones={availableMilestones}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Set this student&apos;s level above before assigning milestones.
            </p>
          )}

          <div className="mt-6 space-y-3">
            {studentMilestones.map((sm) => (
              <StudentMilestoneRow key={sm.id} studentId={student.id} studentMilestone={sm} />
            ))}
            {studentMilestones.length === 0 && (
              <p className="py-4 text-center text-muted-foreground">
                No milestones assigned yet.
              </p>
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
