import Link from "next/link";
import type { CourseApplicationStatus } from "@prisma/client";
import { requireAdminPage } from "@/lib/admin/dal";
import { listCourseApplications } from "@/lib/course-application-review";
import { Container } from "@/components/marketing/container";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const statuses = ["PENDING", "APPROVED", "WAITLISTED", "DECLINED"] as const;

function isStatus(value: string | undefined): value is CourseApplicationStatus {
  return !!value && (statuses as readonly string[]).includes(value);
}

function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export default async function AdminCourseApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPage();
  const { status: rawStatus } = await searchParams;
  const status = isStatus(rawStatus) ? rawStatus : undefined;
  const applications = await listCourseApplications(status);

  return (
    <section className="py-8 sm:py-10">
      <Container>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-primary">Academy</p>
            <h1 className="mt-1 font-heading text-3xl font-semibold">Course applications</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Review applications only. Approval does not create enrollment or course access.
            </p>
          </div>
          <nav aria-label="Filter applications by status" className="flex flex-wrap gap-2 text-sm">
            <Link className={!status ? "font-semibold text-primary" : "text-muted-foreground"} href="/admin/course-applications">
              All
            </Link>
            {statuses.map((value) => (
              <Link
                key={value}
                href={`/admin/course-applications?status=${value}`}
                className={status === value ? "font-semibold text-primary" : "text-muted-foreground"}
              >
                {label(value)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-7 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-muted/35 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Requested course</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Review</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id} className="border-t border-border/70 align-top">
                  <td className="px-4 py-4">
                    <Link href={`/admin/course-applications/${application.id}`} className="font-semibold text-primary hover:underline">
                      {application.fullName}
                    </Link>
                    <p className="mt-1 text-muted-foreground">{application.email}</p>
                  </td>
                  <td className="px-4 py-4">
                    {application.requestedPlan ? (
                      <>
                        <p>{application.requestedPlan.level}</p>
                        <p className="text-muted-foreground">
                          {application.requestedPlan.format === "ONE_TO_ONE" ? "1-to-1" : "Group"}
                        </p>
                      </>
                    ) : (
                      <>
                        <p>{application.requestedLevel ?? "Not sure"}</p>
                        <p className="text-amber-700">Plan selection required</p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-4"><Badge variant={application.status === "PENDING" ? "secondary" : "outline"}>{label(application.status)}</Badge></td>
                  <td className="px-4 py-4 text-muted-foreground">{application.createdAt.toLocaleString()}</td>
                  <td className="px-4 py-4 text-muted-foreground">{application.reviewedAt ? application.reviewedAt.toLocaleString() : "Not reviewed"}</td>
                </tr>
              ))}
              {applications.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No applications match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}
