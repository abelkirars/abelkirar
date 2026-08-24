import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  History,
  LockKeyhole,
  MessageCircle,
  NotebookPen,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
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
import { ContinuePracticeCta } from "@/components/student/continue-practice-cta";
import { getPracticeSummary } from "@/lib/student/practice-summary";

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

// Reuses the existing translated public course-level names instead of
// introducing a second set of dashboard-only level labels.
const LEVEL_TITLE_KEYS: Record<StudentLevel, string> = {
  BEGINNER: "beginner.title",
  INTERMEDIATE: "intermediate.title",
  ADVANCED: "advanced.title",
};

const DASHBOARD_CARD_CLASS =
  "gap-0 rounded-3xl bg-card/95 py-0 shadow-[0_18px_55px_-38px_rgba(42,32,24,0.55)] ring-secondary/10";

export default async function StudentDashboardPage() {
  const session = await requireStudentPage();
  const t = await getTranslations("studentDashboard");
  const tLevels = await getTranslations("courseLevels");
  const assignment = await getCurrentAssignment(session);
  const practiceLogEntries = await listMyPracticeLogEntries(session);
  const notes = await listMyNotes(session);
  const recording = assignment?.recordingRequired
    ? await getMyCurrentAssignmentRecording(session)
    : null;
  const level = await getMyLevel(session);
  const currentMilestone = await getCurrentMilestone(session);
  const achievedMilestones = await listAchievedMilestones(session);
  const practiceSummary = getPracticeSummary(practiceLogEntries);

  const isSubmitted =
    assignment !== null &&
    (SUBMITTED_ASSIGNMENT_STATUSES as readonly string[]).includes(assignment.status);

  const levelLabel = level ? tLevels(LEVEL_TITLE_KEYS[level]) : null;

  // The CTA is derived entirely from safe server-side data already in scope.
  // There is no draft/resume state and no client component receives student
  // curriculum content.
  const continuePractice =
    assignment?.recordingRequired && !recording
      ? { label: t("recordingUploadLabel"), href: "#weekly-practice" as const }
      : assignment && !isSubmitted
        ? { label: t("submitAssignment"), href: "#weekly-practice" as const }
        : { label: t("practiceLogSubmit"), href: "#practice-log" as const };

  return (
    <section className="relative isolate overflow-hidden py-10 sm:py-14 lg:py-16">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-gradient-to-b from-secondary/10 via-primary/5 to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute -top-32 right-[-8rem] -z-10 size-96 rounded-full bg-primary/15 blur-3xl"
      />

      <Container className="max-w-7xl">
        <header className="relative overflow-hidden rounded-[2rem] bg-secondary text-secondary-foreground shadow-[0_28px_90px_-42px_rgba(31,75,63,0.9)] ring-1 ring-secondary/40">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-24 size-80 rounded-full border border-primary/30"
          />
          <div
            aria-hidden="true"
            className="absolute -right-8 -top-12 size-56 rounded-full border border-primary/20"
          />

          <div className="relative p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-3xl">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  <Sparkles aria-hidden="true" className="size-4" />
                  {t("title")}
                </p>
                <h1 className="mt-4 max-w-2xl font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                  {t("greeting", { fullName: session.fullName })}
                </h1>
              </div>
              <StudentLogoutButton />
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-[0.72fr_1.55fr_auto]">
              <div className="rounded-2xl border border-secondary-foreground/15 bg-secondary-foreground/8 p-4 backdrop-blur-sm">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-secondary-foreground/65">
                  <GraduationCap aria-hidden="true" className="size-4 text-primary" />
                  {t("currentLevelHeading")}
                </p>
                {levelLabel ? (
                  <Badge className="mt-3 bg-primary text-primary-foreground">{levelLabel}</Badge>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-secondary-foreground/75">
                    {t("levelNotSetYet")}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-secondary-foreground/15 bg-secondary-foreground/8 p-4 backdrop-blur-sm">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-secondary-foreground/65">
                  <Target aria-hidden="true" className="size-4 text-primary" />
                  {t("currentMilestoneLabel")}
                </p>
                {currentMilestone ? (
                  <div className="mt-3">
                    <h2 className="font-heading text-xl font-semibold text-secondary-foreground">
                      {currentMilestone.milestone.label}
                    </h2>
                    {currentMilestone.milestone.description && (
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-foreground/70">
                        {currentMilestone.milestone.description}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-secondary-foreground/75">
                    {t("noCurrentFocus")}
                  </p>
                )}
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-primary/30 bg-primary/10 p-4 md:col-span-2 lg:col-span-1 lg:min-w-56">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary-foreground/65">
                  {t("continuePracticeHeading")}
                </p>
                <div className="mt-3">
                  <ContinuePracticeCta
                    label={continuePractice.label}
                    href={continuePractice.href}
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* A motivating journey view built only from student-authorized data:
            achieved rows, the current assigned row, and one generic locked
            placeholder. No future milestone, catalog count, or sequence is
            queried or sent to the browser. */}
        <Card className={`${DASHBOARD_CARD_CLASS} mt-6 lg:mt-8`}>
          <CardHeader className="border-b border-border/70 bg-muted/25 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Trophy aria-hidden="true" className="size-5" />
              </span>
              <h2 className="font-heading text-xl font-semibold sm:text-2xl">
                {t("progressHeading")}
              </h2>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-secondary/15 bg-secondary/5 p-4">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-secondary">
                  <CalendarDays aria-hidden="true" className="size-4" />
                  {t("practiceSessionsThisWeek")}
                </dt>
                <dd className="mt-3 font-heading text-3xl font-semibold text-foreground">
                  {practiceSummary.sessionsThisWeek}
                </dd>
              </div>

              <div className="rounded-3xl border border-primary/25 bg-primary/8 p-4">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  <Clock aria-hidden="true" className="size-4" />
                  {t("practiceMinutesThisWeek")}
                </dt>
                <dd className="mt-3 font-heading text-3xl font-semibold text-foreground">
                  {practiceSummary.minutesThisWeek}
                </dd>
              </div>

              <div className="rounded-3xl border border-border bg-muted/25 p-4">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <History aria-hidden="true" className="size-4 text-primary" />
                  {t("latestPracticeLabel")}
                </dt>
                <dd className="mt-3 font-heading text-lg font-semibold text-foreground">
                  {practiceSummary.latestPracticeAt ? (
                    <time dateTime={practiceSummary.latestPracticeAt.toISOString()}>
                      {practiceSummary.latestPracticeAt.toLocaleDateString()}
                    </time>
                  ) : (
                    t("noPracticeLogEntries")
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <section
                aria-labelledby="journey-achieved-heading"
                className="rounded-2xl border border-secondary/15 bg-secondary/5 p-4"
              >
                <p
                  id="journey-achieved-heading"
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-secondary"
                >
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  {t("achievedMilestonesLabel")}
                </p>
                {achievedMilestones.length === 0 ? (
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {t("noAchievedMilestones")}
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {achievedMilestones
                      .slice()
                      .reverse()
                      .map((milestone) => (
                        <article
                          key={milestone.id}
                          className="rounded-xl border border-secondary/15 bg-card/75 p-3 text-sm"
                        >
                          <p className="font-semibold text-foreground">
                            {milestone.milestone.label}
                          </p>
                          {milestone.achievedAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("achievedOnLabel", {
                                date: milestone.achievedAt.toLocaleDateString(),
                              })}
                            </p>
                          )}
                          {milestone.teacherComment && (
                            <p className="mt-2 leading-6 text-foreground/85">
                              {milestone.teacherComment}
                            </p>
                          )}
                        </article>
                      ))}
                  </div>
                )}
              </section>

              <section
                aria-labelledby="journey-current-heading"
                className="rounded-2xl border border-primary/35 bg-primary/8 p-4 ring-1 ring-primary/15"
              >
                <p
                  id="journey-current-heading"
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary"
                >
                  <Target aria-hidden="true" className="size-4" />
                  {t("currentMilestoneLabel")}
                </p>
                {currentMilestone ? (
                  <div className="mt-4">
                    <h3 className="font-heading text-lg font-semibold text-foreground">
                      {currentMilestone.milestone.label}
                    </h3>
                    {currentMilestone.milestone.description && (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {currentMilestone.milestone.description}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {t("noCurrentFocus")}
                  </p>
                )}
              </section>

              <section
                aria-labelledby="journey-next-heading"
                className="rounded-2xl border border-dashed border-border bg-muted/20 p-4"
              >
                <p
                  id="journey-next-heading"
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  <LockKeyhole aria-hidden="true" className="size-4 text-primary" />
                  {t("nextStepLabel")}
                </p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {t("nextStepDescription")}
                </p>
              </section>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 grid items-start gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.72fr)]">
          <div className="space-y-6">
            {/* Native fragment target: keep focus transfer and header clearance
                without adding a second JavaScript navigation path. */}
            <Card
              id="weekly-practice"
              tabIndex={-1}
              className={`${DASHBOARD_CARD_CLASS} scroll-mt-24 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring`}
            >
              <CardHeader className="border-b border-border/70 bg-muted/25 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                      <BookOpen aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                      <h2 className="font-heading text-xl font-semibold sm:text-2xl">
                        {t("currentAssignmentHeading")}
                      </h2>
                      {assignment && (
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarDays aria-hidden="true" className="size-3.5" />
                          <time dateTime={assignment.weekStartDate.toISOString()}>
                            {assignment.weekStartDate.toLocaleDateString()}
                          </time>
                          <span aria-hidden="true">—</span>
                          <time dateTime={assignment.weekEndDate.toISOString()}>
                            {assignment.weekEndDate.toLocaleDateString()}
                          </time>
                        </p>
                      )}
                    </div>
                  </div>
                  {assignment && (
                    <Badge variant="outline" className="border-secondary/20 bg-secondary/5">
                      {t(STATUS_KEYS[assignment.status] ?? "status.notStarted")}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-5 sm:p-6">
                {assignment ? (
                  <div className="space-y-5">
                    <div>
                      <h3 className="font-heading text-xl font-semibold text-foreground">
                        {assignment.weekTitle}
                      </h3>
                      {assignment.instructions && (
                        <p className="mt-3 text-sm leading-6 text-foreground/85">
                          {assignment.instructions}
                        </p>
                      )}
                    </div>

                    {assignment.goals && (
                      <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                        <Target aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                        <p className="text-sm leading-6 text-muted-foreground">
                          <span className="font-semibold text-foreground">{t("goalLabel")}:</span>{" "}
                          {assignment.goals}
                        </p>
                      </div>
                    )}

                    {assignment.studentSubmission && (
                      <div className="border-t border-border/70 pt-5">
                        <p className="text-sm font-semibold">{t("yourSubmissionLabel")}</p>
                        <p className="mt-2 text-sm leading-6 text-foreground/85">
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

                    {assignment.adminFeedback && (
                      <div className="rounded-2xl border border-secondary/15 bg-secondary/5 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{t("feedbackLabel")}</p>
                          {assignment.feedbackStatus && (
                            <Badge variant="outline">{assignment.feedbackStatus}</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground/85">
                          {assignment.adminFeedback}
                        </p>
                        {assignment.feedbackAt && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("feedbackOnLabel", {
                              date: assignment.feedbackAt.toLocaleDateString(),
                            })}
                          </p>
                        )}
                      </div>
                    )}

                    {assignment.recordingRequired && (
                      <div className="border-t border-border/70 pt-5">
                        <p className="text-sm font-semibold">{t("recordingLabel")}</p>
                        {recording ? (
                          recording.mimeType.startsWith("video/") ? (
                            <div className="mt-3 w-fit max-w-full">
                              <video
                                controls
                                src={`/api/student/recordings/${recording.id}`}
                                className="h-auto max-h-[500px] w-auto max-w-xl rounded-2xl object-contain"
                              />
                            </div>
                          ) : (
                            <audio
                              controls
                              src={`/api/student/recordings/${recording.id}`}
                              className="mt-3 w-full"
                            />
                          )
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t("noRecordingYet")}
                          </p>
                        )}
                        <div className="mt-3">
                          <RecordingUpload weeklyPracticeId={assignment.id} />
                        </div>
                      </div>
                    )}

                    <div className="border-t border-border/70 pt-5">
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
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
                    <p className="text-sm leading-6 text-muted-foreground">{t("noAssignment")}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card
              id="practice-log"
              tabIndex={-1}
              className={`${DASHBOARD_CARD_CLASS} scroll-mt-24 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring`}
            >
              <CardHeader className="border-b border-border/70 bg-muted/25 p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <NotebookPen aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="font-heading text-xl font-semibold sm:text-2xl">
                    {t("practiceLogHeading")}
                  </h2>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-5 sm:p-6">
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                  <PracticeLogForm />
                </div>

                <div className="space-y-3">
                  {practiceLogEntries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-4">
                      <p className="text-sm text-muted-foreground">{t("noPracticeLogEntries")}</p>
                    </div>
                  ) : (
                    practiceLogEntries.map((entry) => (
                      <article
                        key={entry.id}
                        className="rounded-2xl border border-border/70 bg-card p-4 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <time
                            dateTime={entry.practicedAt.toISOString()}
                            className="font-semibold text-foreground"
                          >
                            {entry.practicedAt.toLocaleDateString()}
                          </time>
                          <Badge variant="outline" className="bg-muted/35">
                            {t("practiceLogMinutes", { minutes: entry.durationMinutes })}
                          </Badge>
                        </div>
                        <p className="mt-2 leading-6 text-foreground/85">{entry.focus}</p>
                        {entry.selfRating && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("practiceLogSelfRatingLabel")}: {entry.selfRating}
                          </p>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className={DASHBOARD_CARD_CLASS}>
              <CardHeader className="border-b border-border/70 bg-muted/25 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                    <MessageCircle aria-hidden="true" className="size-4" />
                  </span>
                  <h2 className="font-heading text-lg font-semibold">{t("notesHeading")}</h2>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {notes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-4">
                    <p className="text-sm text-muted-foreground">{t("noNotes")}</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <article
                      key={note.id}
                      className="rounded-2xl border border-border/70 bg-muted/15 p-4 text-sm"
                    >
                      <time
                        dateTime={note.createdAt.toISOString()}
                        className="text-xs text-muted-foreground"
                      >
                        {note.createdAt.toLocaleDateString()}
                      </time>
                      <p className="mt-2 leading-6 text-foreground/85">{note.body}</p>
                    </article>
                  ))
                )}
              </CardContent>
            </Card>

          </aside>
        </div>
      </Container>
    </section>
  );
}
