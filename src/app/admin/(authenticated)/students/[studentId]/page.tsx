import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { Badge } from "@/components/ui/badge";
import { StudentForm } from "@/components/admin/student-form";
import { StudentStatusToggle } from "@/components/admin/student-status-toggle";
import { ResendInviteButton } from "@/components/admin/resend-invite-button";
import { StudentEmailCorrection } from "@/components/admin/student-email-correction";

export const dynamic = "force-dynamic";

export default async function AdminStudentProfilePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!student) notFound();

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
      </Container>
    </section>
  );
}
