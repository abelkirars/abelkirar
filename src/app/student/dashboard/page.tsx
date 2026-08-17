import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import type { StudentLevel } from "@prisma/client";
import { Container } from "@/components/marketing/container";
import { requireStudentPage } from "@/lib/student/dal";
import {
  getCurrentAssignment,
  listMyPracticeLogEntries,
  listMyNotes,
  getMyCurrentAssignmentRecording,
  getMyLevel,
  getCurrentMilestone,
  listAchievedMilestones,
  SUBMITTED_ASSIGNMENT_STATUSES,
} from "@/lib/student/queries";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PracticeLogForm } from "@/components/student/practice-log-form";
import { AssignmentSubmitForm } from "@/components/student/assignment-submit-form";
import { RecordingUpload } from "@/components/student/recording-upload";
import { StudentLogoutButton } from "@/components/student/student-logout-button";
import { LevelBadge } from "@/components/student/level-badge";
import { ContinuePracticeCta } from "@/components/student/continue-practice-cta";

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

// Reuses the marketing courseLevels.*.title strings ("Beginner"/
// "Intermediate"/"Advanced") for the level badge's display text instead of
// adding dedicated studentDashboard level-name keys — same words, same
// locale files, fewer keys to keep in sync between en.json/am.json. The
// tradeoff (coupling this label to a marketing namespace that could change
// wording for marketing reasons) was raised and accepted for the dashboard
// redesign.
const LEVEL_TITLE_KEYS: Record<StudentLevel, string> = {
  BEGINNER: "beginner.title",
  INTERMEDIATE: "intermediate.title",
  ADVANCED: "advanced.title",
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
  const tLevels = await getTranslations("courseLevels");
  const assignment = await getCurrentAssignment(session);
  const practiceLogEntries = await listMyPracticeLogEntries(session);
  const notes = await listMyNotes(session);
  // Only queried when relevant — "optional recording upload if requested"
  // per the brief, so this only matters when recordingRequired is true.
  const recording = assignment?.recordingRequired
    ? await getMyCurrentAssignmentRecording(session)
    : null;
  const level = await getMyLevel(session);
  const currentMilestone = await getCurrentMilestone(session);
  const achievedMilestones = await listAchievedMilestones(session);

  const isSubmitted =
    assignment !== null &&
    (SUBMITTED_ASSIGNMENT_STATUSES as readonly string[]).includes(assignment.status);

  const levelLabel = level ? tLevels(LEVEL_TITLE_KEYS[level]) : null;

  // The one thing to do right now, in priority order — built from the same
  // assignment/isSubmitted/recording values already computed above, no new
  // query. There is no "resume a draft" state: nothing persists a
  // submission in progress (see AssignmentSubmitForm), so the only real
  // cases are "a recording is still needed," "the assignment itself still
  // needs submitting," or — always available, assignment or not — "log
  // today's practice."
  const continuePractice =
    assignment?.recordingRequired && !recording
      ? { label: t("recordingUploadLabel"), href: "#weekly-practice" as const }
      : assignment && !isSubmitted
        ? { label: t("submitAssignment"), href: "#weekly-practice" as const }
        : { label: t("practiceLogSubmit"), href: "#practice-log" as const };

  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>
            <p className="mt-2 text-muted-foreground">
              {t("greeting", { fullName: session.fullName })}
            </p>
          </div>
          <StudentLogoutButton />
        </div>

        <div className="mt-8 space-y-6">
          {/* Current Level + Current Focus: the two student-facing status
              facts (spec §7.G/§9), paired in one card — level badge and
              current-focus label/description side by side on larger
              screens, stacked on mobile. No percentage here or anywhere on
              this page: PERCENT_READY is false for every level, and this
              design doesn't wait on it — current focus plus achieved
              labels are the whole story until it flips. */}
          <Card className="ring-primary/30 bg-primary/5">
            <CardContent className="flex flex-col gap-6 sm:flex-row sm:divide-x sm:divide-border/60">
              <div className="sm:w-1/3 sm:pr-6">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("currentLevelHeading")}
                </p>
                <div className="mt-2">
                  <LevelBadge label={levelLabel} emptyText={t("levelNotSetYet")} />
                </div>
              </div>
              <div className="sm:w-2/3 sm:pl-6">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("currentMilestoneLabel")}
                </p>
                {currentMilestone ? (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-foreground">
                      {currentMilestone.milestone.label}
                    </p>
                    {currentMilestone.milestone.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {currentMilestone.milestone.description}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">{t("noCurrentFocus")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Continue Practice: one CTA, jumping to whichever real section
              below is the next actionable step — never a "resume" feature,
              since no draft data exists to resume. Always resolvable, even
              on a brand-new student's empty dashboard, because it falls
              back to the practice log form, which needs no assignment to
              exist. */}
          <Card>
            <CardHeader>
              <h2 className="font-heading text-xl font-semibold">
                {t("continuePracticeHeading")}
              </h2>
            </CardHeader>
            <CardContent>
              <ContinuePracticeCta label={continuePractice.label} href={continuePractice.href} />
            </CardContent>
          </Card>

          <Card id="weekly-practice">
            <CardHeader>
              <h2 className="font-heading text-xl font-semibold">
                {t("currentAssignmentHeading")}
              </h2>
            </CardHeader>
            <CardContent>
              {assignment ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-medium">{assignment.weekTitle}</h3>
                    <Badge variant="outline">
                      {t(STATUS_KEYS[assignment.status] ?? "status.notStarted")}
                    </Badge>
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
                      <p className="mt-1 text-sm text-foreground">
                        {assignment.studentSubmission}
                      </p>
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
                          <Badge variant="outline">{assignment.feedbackStatus}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-foreground">{assignment.adminFeedback}</p>
                      {assignment.feedbackAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("feedbackOnLabel", {
                            date: assignment.feedbackAt.toLocaleDateString(),
                          })}
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
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("noRecordingYet")}
                        </p>
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
                      <p className="text-sm text-muted-foreground">
                        {t("recordingRequiredNotice")}
                      </p>
                    ) : (
                      <AssignmentSubmitForm />
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noAssignment")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-heading text-xl font-semibold">{t("notesHeading")}</h2>
            </CardHeader>
            <CardContent className="space-y-3">
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
            </CardContent>
          </Card>

          {/* Achieved milestone labels are teacher-authored and
              student-facing by design (see Milestone.label's schema
              comment) — only achieved/current ones ever reach this query
              layer at all. */}
          <Card>
            <CardHeader>
              <h2 className="font-heading text-xl font-semibold">
                {t("achievedMilestonesLabel")}
              </h2>
            </CardHeader>
            <CardContent>
              {achievedMilestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noAchievedMilestones")}</p>
              ) : (
                <div className="space-y-2">
                  {achievedMilestones.map((m) => (
                    <div
                      key={m.id}
                      className="flex gap-3 rounded-md border border-border/60 p-3 text-sm"
                    >
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-secondary" />
                      <div>
                        <p className="font-medium text-foreground">{m.milestone.label}</p>
                        {m.achievedAt && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("achievedOnLabel", { date: m.achievedAt.toLocaleDateString() })}
                          </p>
                        )}
                        {m.teacherComment && (
                          <p className="mt-1 text-sm text-foreground">{m.teacherComment}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="practice-log">
            <CardHeader>
              <h2 className="font-heading text-xl font-semibold">{t("practiceLogHeading")}</h2>
            </CardHeader>
            <CardContent className="space-y-6">
              <PracticeLogForm />

              <div className="space-y-3">
                {practiceLogEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noPracticeLogEntries")}</p>
                ) : (
                  practiceLogEntries.map((entry) => (
                    <div key={entry.id} className="rounded-md border border-border/60 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {entry.practicedAt.toLocaleDateString()}
                        </span>
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
            </CardContent>
          </Card>
        </div>
      </Container>
    </section>
  );
}
