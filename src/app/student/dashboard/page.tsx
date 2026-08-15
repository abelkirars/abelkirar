import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { requireStudentPage } from "@/lib/student/dal";
import {
  getCurrentAssignment,
  listMyPracticeLogEntries,
  listMyNotes,
  getMyCurrentAssignmentRecording,
  SUBMITTED_ASSIGNMENT_STATUSES,
} from "@/lib/student/queries";
import { PracticeLogForm } from "@/components/student/practice-log-form";
import { AssignmentSubmitForm } from "@/components/student/assignment-submit-form";
import { RecordingUpload } from "@/components/student/recording-upload";

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
// error, not just an omission. As of Stage 7, every one of the selected
// fields is rendered somewhere below — nothing is fetched and left unused.
// Note: nothing currently writes adminFeedback/feedbackStatus/feedbackAt
// (that's Stage 9, teacher review — not built yet), so that block simply
// never renders today. It's ready, not decorative.
export default async function StudentDashboardPage() {
  const session = await requireStudentPage();
  const t = await getTranslations("studentDashboard");
  const assignment = await getCurrentAssignment(session);
  const practiceLogEntries = await listMyPracticeLogEntries(session);
  const notes = await listMyNotes(session);
  // Only queried when relevant — "optional recording upload if requested"
  // per the brief, so this only matters when recordingRequired is true.
  const recording = assignment?.recordingRequired
    ? await getMyCurrentAssignmentRecording(session)
    : null;

  const isSubmitted =
    assignment !== null &&
    (SUBMITTED_ASSIGNMENT_STATUSES as readonly string[]).includes(assignment.status);

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

              {/* Evidence the work was received: what was submitted, and
                  when. Renders whenever studentSubmission is set, even if
                  status has since moved past SUBMITTED (reviewed/completed)
                  or been reopened back to IN_PROGRESS — it's a factual
                  record of the last submission, not tied to current status. */}
              {assignment.studentSubmission && (
                <div className="border-t border-border/60 pt-3">
                  <p className="text-sm font-medium">{t("yourSubmissionLabel")}</p>
                  <p className="mt-1 text-sm text-foreground">{assignment.studentSubmission}</p>
                  {assignment.submittedAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("submittedOnLabel", {
                        date: assignment.submittedAt.toLocaleDateString(),
                      })}
                    </p>
                  )}
                </div>
              )}

              {/* feedbackStatus is deliberately rendered as-is, not mapped
                  through a translation key like the status badge above —
                  it's a free, teacher-authored string (see the schema
                  comment on WeeklyPractice.feedbackStatus), not a fixed
                  enum, so there is no fixed set of keys to map it through. */}
              {assignment.adminFeedback && (
                <div className="border-t border-border/60 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{t("feedbackLabel")}</p>
                    {assignment.feedbackStatus && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {assignment.feedbackStatus}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-foreground">{assignment.adminFeedback}</p>
                  {assignment.feedbackAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("feedbackOnLabel", { date: assignment.feedbackAt.toLocaleDateString() })}
                    </p>
                  )}
                </div>
              )}

              {/* Recording: server decides existing-vs-not from real data,
                  same as everything else on this page. The player is plain
                  server-rendered HTML — its `src` is a same-origin route
                  that does its own auth + ownership check and redirects to
                  the real (never-exposed-to-props) signed URL, so no
                  client component ever touches a path or a signed URL.
                  RecordingUpload (when mounted) receives only
                  assignment.id — an opaque id, not content — see its own
                  file comment. */}
              {assignment.recordingRequired && (
                <div className="border-t border-border/60 pt-3">
                  <p className="text-sm font-medium">{t("recordingLabel")}</p>
                  {recording ? (
                    (recording.mimeType.startsWith("video/") ? (
                      <div className="mt-2 w-fit max-w-full">
                        <video
                          controls
                          src={`/api/student/recordings/${recording.id}`}
                          className="h-auto w-auto max-w-xl max-h-[500px] rounded-md object-contain"
                        />
                      </div>
                    ) : (
                      <audio
                        controls
                        src={`/api/student/recordings/${recording.id}`}
                        className="mt-2 w-full"
                      />
                    ))
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">{t("noRecordingYet")}</p>
                  )}
                  <div className="mt-2">
                    <RecordingUpload weeklyPracticeId={assignment.id} />
                  </div>
                </div>
              )}

              {/* Submission: which of these three renders is decided here,
                  server-side, from real assignment data. The form itself
                  (when shown) carries no assignment data as props — see
                  AssignmentSubmitForm. submitCurrentAssignment enforces the
                  same two rules again server-side regardless of which
                  branch rendered, so this is a UX nicety, not the guard. */}
              <div className="border-t border-border/60 pt-3">
                {isSubmitted ? (
                  <p className="text-sm text-muted-foreground">{t("submissionReceived")}</p>
                ) : assignment.recordingRequired && !recording ? (
                  <p className="text-sm text-muted-foreground">{t("recordingRequiredNotice")}</p>
                ) : (
                  <AssignmentSubmitForm />
                )}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t("noAssignment")}</p>
          )}
        </div>

        <div className="mt-8 rounded-lg border border-border p-6">
          <h2 className="font-heading text-xl font-semibold">{t("notesHeading")}</h2>
          <div className="mt-4 space-y-3">
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noNotes")}</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-md border border-border/60 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {note.createdAt.toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-foreground">{note.body}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-border p-6">
          <h2 className="font-heading text-xl font-semibold">{t("practiceLogHeading")}</h2>

          <div className="mt-4">
            <PracticeLogForm />
          </div>

          <div className="mt-6 space-y-3">
            {practiceLogEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noPracticeLogEntries")}</p>
            ) : (
              practiceLogEntries.map((entry) => (
                <div key={entry.id} className="rounded-md border border-border/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{entry.practicedAt.toLocaleDateString()}</span>
                    <span className="text-muted-foreground">
                      {t("practiceLogMinutes", { minutes: entry.durationMinutes })}
                    </span>
                  </div>
                  <p className="mt-1 text-foreground">{entry.focus}</p>
                  {entry.selfRating && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("practiceLogSelfRatingLabel")}: {entry.selfRating}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
