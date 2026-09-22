import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/dal";
import { listActiveCoursePlans } from "@/lib/courses/plans";
import { assertCohortSelectable, listAdminCohorts } from "@/lib/courses/cohorts";
import { PrepareEnrollmentForm } from "@/components/admin/prepare-enrollment-form";
import { Container } from "@/components/marketing/container";
export const dynamic = "force-dynamic";
export default async function PreparePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const application = await prisma.courseApplication.findUnique({ where: { id }, include: { customer: { select: { supabaseUserId: true } }, courseEnrollment: { select: { id: true } } } });
  if (!application) notFound();
  if (application.status !== "APPROVED" || application.courseEnrollment) return <Container className="py-10"><h1>Preparation unavailable</h1><p>Only approved applications without an enrollment can be prepared.</p><Link href={`/admin/course-applications/${id}`}>Back to application</Link></Container>;
  const [plans, cohorts, learners] = await Promise.all([
    listActiveCoursePlans(), listAdminCohorts(), prisma.studentProfile.findMany({ where: { archivedAt: null, status: "ACTIVE" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 200 }),
  ]);
  const eligible = cohorts.filter(c => { try { assertCohortSelectable(c, c.coursePlanId); return true; } catch { return false; } });
  return <Container className="max-w-3xl space-y-6 py-10">
    <Link href={`/admin/course-applications/${id}`} className="text-primary hover:underline">← Application review</Link>
    <h1 className="font-heading text-3xl">Prepare Enrollment</h1>
    <p>Application: {application.fullName}. Payer and learner identities must be explicitly resolved, never inferred from this name or application email.</p>
    <PrepareEnrollmentForm applicationId={id} plans={plans.filter(p => !application.requestedPlanId || p.id === application.requestedPlanId)} cohorts={eligible.map(c => ({ id: c.id, code: c.code, coursePlanId: c.coursePlanId, courseStartDate: c.courseStartDate!.toISOString().slice(0,10) }))} learners={learners} initial={{ coursePlanId: application.requestedPlanId ?? "", supabaseUserId: application.customer?.supabaseUserId ?? "", studentId: application.studentProfileId ?? "" }} />
  </Container>;
}
