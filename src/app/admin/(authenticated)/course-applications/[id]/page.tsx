import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/dal";
import { getCourseApplicationReview } from "@/lib/course-application-review";
import { listActiveCoursePlans } from "@/lib/courses/plans";
import { formatMoney } from "@/lib/notifications/types";
import { Container } from "@/components/marketing/container";
import { Badge } from "@/components/ui/badge";
import { CourseApplicationDecisionPanel } from "@/components/admin/course-application-decision-panel";

export const dynamic = "force-dynamic";

function value(raw: string | null | undefined) {
  return raw?.trim() || "Not provided";
}

export default async function AdminCourseApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const [application, plans] = await Promise.all([
    getCourseApplicationReview(id),
    listActiveCoursePlans(),
  ]);
  if (!application) notFound();

  return (
    <section className="py-8 sm:py-10">
      <Container className="max-w-5xl space-y-7">
        <div>
          <Link href="/admin/course-applications" className="text-sm text-primary hover:underline">← All applications</Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-3xl font-semibold">{application.fullName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Submitted {application.createdAt.toLocaleString()}</p>
            </div>
            <Badge variant="outline">{application.status}</Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-xl font-semibold">Applicant details</h2>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Email</dt><dd className="font-medium">{application.email}</dd></div>
                <div><dt className="text-muted-foreground">Phone</dt><dd className="font-medium">{value(application.phone)}</dd></div>
                <div><dt className="text-muted-foreground">Country</dt><dd className="font-medium">{value(application.country)}</dd></div>
                <div><dt className="text-muted-foreground">Lesson language</dt><dd className="font-medium">{value(application.lessonLanguage)}</dd></div>
                <div><dt className="text-muted-foreground">Kirar model</dt><dd className="font-medium">{value(application.kirarModel)}</dd></div>
                <div><dt className="text-muted-foreground">Under 15</dt><dd className="font-medium">{application.isUnder15 === true ? "Yes" : application.isUnder15 === false ? "No" : "Unknown (legacy application)"}</dd></div>
              </dl>
              {application.isUnder15 === true && (
                <dl className="mt-4 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Guardian</dt><dd className="font-medium">{value(application.guardianName)}</dd></div>
                  <div><dt className="text-muted-foreground">Relationship</dt><dd className="font-medium">{value(application.guardianRelationship)}</dd></div>
                  <div><dt className="text-muted-foreground">Guardian phone</dt><dd className="font-medium">{value(application.guardianPhone)}</dd></div>
                  <div><dt className="text-muted-foreground">Consent recorded</dt><dd className="font-medium">{application.guardianConsentAt?.toLocaleString() ?? "Not recorded"}</dd></div>
                </dl>
              )}
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">Experience and goals</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{value(application.applicantMessage)}</p>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-xl font-semibold">Requested course</h2>
              {application.requestedPlan ? (
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Plan</dt><dd className="font-medium">{application.requestedPlan.code}</dd></div>
                  <div><dt className="text-muted-foreground">Level / format</dt><dd className="font-medium">{application.requestedPlan.level} · {application.requestedPlan.format === "ONE_TO_ONE" ? "1-to-1" : "Group"}</dd></div>
                  <div><dt className="text-muted-foreground">Monthly tuition</dt><dd className="font-medium">{formatMoney(application.requestedPlan.monthlyPriceCents, application.requestedPlan.currency)}</dd></div>
                  <div><dt className="text-muted-foreground">Group capacity</dt><dd className="font-medium">{application.requestedPlan.format === "GROUP" ? `${application.requestedPlan.groupMinimumStudents}–${application.requestedPlan.groupMaximumStudents} students` : "Not applicable"}</dd></div>
                </dl>
              ) : (
                <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-semibold">Legacy application — no plan selected</p>
                  <p className="mt-1">Requested level: {application.requestedLevel ?? "Not sure yet"}. Select an active plan explicitly before approval; format will not be guessed.</p>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-xl font-semibold">Decision history</h2>
              <ol className="mt-4 space-y-4">
                {application.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-primary/30 pl-4 text-sm">
                    <p className="font-medium">{event.fromStatus ? `${event.fromStatus} → ` : ""}{event.toStatus}</p>
                    <p className="text-muted-foreground">{event.createdAt.toLocaleString()} · {event.actorAdmin?.displayName ?? "Applicant submission"}</p>
                    {event.note && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside>
            <CourseApplicationDecisionPanel
              applicationId={application.id}
              status={application.status}
              requestedPlanId={application.requestedPlanId}
              plans={plans}
            />
          </aside>
        </div>
      </Container>
    </section>
  );
}
