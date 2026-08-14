import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { requireStudentPage } from "@/lib/student/dal";
import { getCurrentAssignment } from "@/lib/student/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Student Dashboard",
};

const STATUS_KEYS: Record<string, string> = {
  NOT_STARTED: "status.notStarted",
  IN_PROGRESS: "status.inProgress",
  SUBMITTED: "status.submitted",
  REVIEWED: "status.reviewed",
  COMPLETED: "status.completed",
  MISSED: "status.missed",
};

// getCurrentAssignment (src/lib/student/queries.ts) selects only
// id/weekTitle/weekStartDate/weekEndDate/instructions/goals/
// recordingRequired/status/studentSubmission/submittedAt/adminFeedback/
// feedbackStatus/feedbackAt. teacherNotes, internalCurriculumRef, and
// currentTechnique are not on that select, so they don't exist on
// `assignment`'s type at all — referencing them here would be a compile
// error, not just an omission. recordingRequired/studentSubmission/
// adminFeedback etc. exist on the type (for later stages) but are
// deliberately not rendered yet — this stage is the assignment view only.
export default async function StudentDashboardPage() {
  const session = await requireStudentPage();
  const t = await getTranslations("studentDashboard");
  const assignment = await getCurrentAssignment(session);

  return (
    <section className="py-16 sm:py-24">
      <Container>
        <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("greeting", { fullName: session.fullName })}
        </p>

        <div className="mt-8 rounded-lg border border-border p-6">
          <h2 className="font-heading text-xl font-semibold">
            {t("currentAssignmentHeading")}
          </h2>

          {assignment ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-medium">{assignment.weekTitle}</h3>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {t(STATUS_KEYS[assignment.status] ?? "status.notStarted")}
                </span>
              </div>
              {assignment.instructions && (
                <p className="text-sm text-foreground">{assignment.instructions}</p>
              )}
              {assignment.goals && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t("goalLabel")}:</span> {assignment.goals}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t("noAssignment")}</p>
          )}
        </div>
      </Container>
    </section>
  );
}
