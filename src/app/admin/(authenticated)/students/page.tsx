import Link from "next/link";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StudentForm } from "@/components/admin/student-form";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;

  const where: Prisma.StudentProfileWhereInput = {
    ...(status === "ACTIVE" || status === "INACTIVE" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const students = await prisma.studentProfile.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  function statusFilterHref(value?: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (value) params.set("status", value);
    const qs = params.toString();
    return qs ? `/admin/students?${qs}` : "/admin/students";
  }

  return (
    <section className="py-10">
      <Container>
        <h1 className="font-heading text-2xl font-semibold">Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage student accounts and invitations.
        </p>

        <div className="mt-6 rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium">Add student</h2>
          <StudentForm />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <form className="flex gap-2" method="get">
            {status && <input type="hidden" name="status" value={status} />}
            <Input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search by name or email"
              className="w-64"
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          <div className="flex gap-2 text-sm">
            <Link
              href={statusFilterHref(undefined)}
              className={!status ? "font-medium" : "text-muted-foreground"}
            >
              All
            </Link>
            <Link
              href={statusFilterHref("ACTIVE")}
              className={status === "ACTIVE" ? "font-medium" : "text-muted-foreground"}
            >
              Active
            </Link>
            <Link
              href={statusFilterHref("INACTIVE")}
              className={status === "INACTIVE" ? "font-medium" : "text-muted-foreground"}
            >
              Inactive
            </Link>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Level</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Enrolled</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b border-border/60">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/students/${student.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {student.fullName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{student.email}</td>
                  <td className="py-2 pr-4">
                    {student.level ? LEVEL_LABELS[student.level] : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant={student.status === "ACTIVE" ? "default" : "outline"}>
                      {student.status === "ACTIVE" ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {student.enrollmentDate?.toLocaleDateString() ?? "—"}
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}
