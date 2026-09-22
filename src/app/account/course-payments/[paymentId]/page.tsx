import type { Metadata } from "next";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, ShieldCheck, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { CoursePaymentProofForm } from "@/components/account/course-payment-proof-form";
import { Container } from "@/components/marketing/container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CoursePaymentCustomerDeniedError,
  CoursePaymentNotFoundError,
  CustomerAuthenticationError,
  CustomerEmailNotVerifiedError,
  getCurrentCustomerCoursePayment,
} from "@/lib/courses/course-payment-access";
import { getConfiguredCoursePaymentInstructions } from "@/lib/courses/course-payment-instructions";
import { formatPaymentDeadline } from "@/lib/courses/payment-deadline";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Course payment" };

function utcDate(locale: string, value: Date): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(value);
}

function localClassTime(locale: string, value: Date): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(value);
}

export default async function CoursePaymentPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  let payment;
  try {
    payment = await getCurrentCustomerCoursePayment(paymentId);
  } catch (error) {
    if (error instanceof CustomerAuthenticationError || error instanceof CustomerEmailNotVerifiedError) {
      redirect(`/account/login?next=${encodeURIComponent(`/account/course-payments/${paymentId}`)}`);
    }
    if (error instanceof CoursePaymentNotFoundError || error instanceof CoursePaymentCustomerDeniedError) {
      notFound();
    }
    throw error;
  }

  const [locale, t] = await Promise.all([getLocale(), getTranslations("coursePayment")]);
  const instructions = getConfiguredCoursePaymentInstructions();
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: payment.currency });
  const inputAmount = (payment.finalAmountCents / 100).toFixed(2);
  const statusLabels = {
    PENDING: t("status.pending"),
    PROOF_SUBMITTED: t("status.proofSubmitted"),
    VERIFIED: t("status.verified"),
    REJECTED: t("status.rejected"),
    EXPIRED: t("status.expired"),
    PAST_DUE: t("status.pastDue"),
    CANCELLED: t("status.cancelled"),
  } as const;
  const canSubmit = payment.status === "PENDING";
  const isWaiting = payment.status === "PROOF_SUBMITTED";
  const isVerified = payment.status === "VERIFIED";
  const cohort = payment.enrollment.cohort;

  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p>
            <h1 className="mt-2 font-heading text-3xl font-semibold sm:text-4xl">{t("title")}</h1>
            <p className="mt-2 text-muted-foreground">{payment.enrollment.learner.fullName} · {payment.enrollment.course.code.replaceAll("_", " ")}</p>
          </div>
          <Badge
            variant={isVerified ? "secondary" : payment.displayStatus === "EXPIRED" || payment.displayStatus === "CANCELLED" ? "destructive" : "outline"}
            className="h-auto self-start px-3 py-1.5 text-sm sm:self-auto"
          >
            {statusLabels[payment.displayStatus as keyof typeof statusLabels]}
          </Badge>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <Card className="border border-border/80 shadow-sm">
              <CardHeader className="border-b border-border/70">
                <CardTitle>{t("summary.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("summary.learner")}</dt>
                    <dd className="mt-1 font-medium">{payment.enrollment.learner.fullName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("summary.relationship")}</dt>
                    <dd className="mt-1 font-medium">{payment.relationship ? t(`relationship.${payment.relationship}`) : t("relationship.unknown")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("summary.levelFormat")}</dt>
                    <dd className="mt-1 font-medium">{t(`level.${payment.enrollment.course.level}`)} · {t(`format.${payment.enrollment.course.format}`)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("summary.billingPeriod")}</dt>
                    <dd className="mt-1 font-medium">{utcDate(locale, payment.periodStart)} – {utcDate(locale, payment.periodEnd)}</dd>
                  </div>
                </dl>

                {cohort?.weeklyDay && cohort.localStartTime && cohort.timeZone && (
                  <div className="rounded-xl bg-muted/55 p-4">
                    <div className="flex items-center gap-2 font-semibold"><Users className="size-4 text-secondary" />{cohort.name}</div>
                    <p className="mt-2 flex items-center gap-2 text-sm"><Clock3 className="size-4 text-muted-foreground" />{t(`weekday.${cohort.weeklyDay}`)} · {localClassTime(locale, cohort.localStartTime)} · {cohort.timeZone}</p>
                    {cohort.courseStartDate && <p className="mt-2 flex items-center gap-2 text-sm"><CalendarDays className="size-4 text-muted-foreground" />{utcDate(locale, cohort.courseStartDate)}{cohort.courseEndDate ? ` – ${utcDate(locale, cohort.courseEndDate)}` : ""}</p>}
                  </div>
                )}

                <div className="border-t border-border pt-4">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("summary.base")}</span><span>{money.format(payment.baseAmountCents / 100)}</span></div>
                  {payment.discountAmountCents > 0 && (
                    <div className="mt-2 flex justify-between text-sm text-secondary"><span>{payment.promotionName || t("summary.discount")}</span><span>−{money.format(payment.discountAmountCents / 100)}</span></div>
                  )}
                  <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
                    <span className="font-semibold">{t("summary.amountDue")}</span>
                    <span className="font-heading text-3xl font-semibold text-secondary">{money.format(payment.finalAmountCents / 100)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {payment.kind === "INITIAL_ENROLLMENT" && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="flex items-start gap-2 font-semibold"><CalendarDays className="mt-0.5 size-5 text-primary" />{t("deadline", { deadline: formatPaymentDeadline(locale, payment.expiresAt) })}</p>
              </div>
            )}

            {canSubmit && (
              <Card className="border border-border/80 shadow-sm">
                <CardHeader className="border-b border-border/70">
                  <CardTitle>{t("instructions.title")}</CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">{t("instructions.description")}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {instructions.length ? instructions.map((instruction) => (
                    <div key={instruction.method} className="rounded-xl border border-border bg-background p-4">
                      <p className="font-semibold">{instruction.label}</p>
                      {instruction.recipientName && <p className="mt-2 text-sm">{t("instructions.recipient", { name: instruction.recipientName })}</p>}
                      <p className="mt-1 break-all text-sm">{t("instructions.sendTo", { destination: instruction.destination })}</p>
                      {instruction.additionalInstructions && <p className="mt-2 text-sm text-muted-foreground">{instruction.additionalInstructions}</p>}
                    </div>
                  )) : (
                    <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
                      {t("instructions.unavailable")}
                    </div>
                  )}
                  <p className="text-sm font-medium">{t("instructions.memo", { reference: payment.id })}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            <Card className="border border-border/80 shadow-sm lg:sticky lg:top-[calc(var(--header-height)+1.5rem)]">
              <CardHeader className="border-b border-border/70">
                <CardTitle>{canSubmit ? t("upload.title") : t("state.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                {canSubmit && instructions.length > 0 ? (
                  <CoursePaymentProofForm
                    paymentId={payment.id}
                    amount={inputAmount}
                    availableMethods={instructions.map(({ method, label }) => ({ method, label }))}
                  />
                ) : isWaiting ? (
                  <StateMessage icon={<ShieldCheck />} title={t("state.receivedTitle")} body={t("state.receivedBody")} />
                ) : isVerified ? (
                  <StateMessage icon={<CheckCircle2 />} title={t("state.verifiedTitle")} body={t("state.verifiedBody")} />
                ) : payment.displayStatus === "REJECTED" ? (
                  <StateMessage icon={<AlertCircle />} title={t("state.rejectedTitle")} body={payment.latestSubmission?.rejectionReason || t("state.rejectedBody")} />
                ) : payment.status === "PAST_DUE" ? (
                  <StateMessage icon={<AlertCircle />} title={t("state.pastDueTitle")} body={t("state.pastDueBody")} />
                ) : (
                  <StateMessage icon={<AlertCircle />} title={t("state.closedTitle")} body={t("state.closedBody")} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
}

function StateMessage({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-muted/55 p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 text-secondary [&>svg]:size-5">{icon}</span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}
