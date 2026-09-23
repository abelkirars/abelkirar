import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { serializable } from "./admin-service";
import { dateKey, monthlyBoundaryInstants, nextMonthlyPeriod } from "./monthly-billing-calendar";
import { isIanaTimeZone } from "./preparation-rules";
import { paymentPriceSnapshot } from "./course-payment-pricing";
import { enqueueCoursePaymentNotification } from "@/lib/notifications/course-payment-outbox";
import { monthlyPaymentRequiredEmail, monthlyPastDueEmail } from "@/lib/notifications/course-payment-content";

type Tx = Prisma.TransactionClient;
export type MonthlyGenerationOutcome = "CREATED" | "EXISTS" | "INELIGIBLE" | "TOO_EARLY" | "PARTIAL_FINAL_PERIOD";

export async function generateMonthlyPaymentForEnrollment(enrollmentId: string, now = new Date()) {
  return serializable(async tx => {
    await tx.$queryRaw`SELECT id FROM "CourseEnrollment" WHERE id = ${enrollmentId} FOR UPDATE`;
    const enrollment = await tx.courseEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        customer: true, student: true, coursePlan: true, application: true, cohort: true,
        payments: { where: { revision: 1 }, orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!enrollment || enrollment.status !== "ACTIVE" || enrollment.archivedAt || !enrollment.billingTimeZone
      || !isIanaTimeZone(enrollment.billingTimeZone) || !enrollment.coursePlan.active || enrollment.coursePlan.archivedAt
      || enrollment.coursePlan.currency !== "USD" || enrollment.coursePlan.billingInterval !== "MONTHLY") {
      return { enrollmentId, outcome: "INELIGIBLE" as MonthlyGenerationOutcome };
    }
    const initial = enrollment.payments.find(payment => payment.kind === "INITIAL_ENROLLMENT");
    if (!initial) return { enrollmentId, outcome: "INELIGIBLE" as MonthlyGenerationOutcome };
    const anchor = dateKey(initial.periodStart);
    const latest = enrollment.payments.at(-1)!;
    const next = nextMonthlyPeriod(anchor, dateKey(latest.periodStart));
    if (enrollment.payments.some(payment => dateKey(payment.periodStart) === next.periodStart)) {
      return { enrollmentId, outcome: "EXISTS" as MonthlyGenerationOutcome };
    }
    if (enrollment.cohort?.courseEndDate && next.periodEnd > dateKey(enrollment.cohort.courseEndDate)) {
      return { enrollmentId, outcome: "PARTIAL_FINAL_PERIOD" as MonthlyGenerationOutcome, periodStart: next.periodStart, periodEnd: next.periodEnd };
    }
    const timing = monthlyBoundaryInstants(next.periodStart, enrollment.billingTimeZone);
    if (now < timing.generationAt) return { enrollmentId, outcome: "TOO_EARLY" as MonthlyGenerationOutcome };
    const pricing = paymentPriceSnapshot(enrollment.coursePlan.monthlyPriceCents, enrollment.coursePlan.currency, null);
    const payment = await tx.coursePayment.create({ data: {
      enrollmentId, kind: "MONTHLY", revision: 1,
      periodStart: new Date(`${next.periodStart}T00:00:00.000Z`),
      periodEnd: new Date(`${next.periodEnd}T00:00:00.000Z`),
      dueAt: timing.dueAt, expiresAt: timing.expiresAt, status: "PENDING", ...pricing,
    } });
    await enqueueCoursePaymentNotification(tx, {
      paymentId: payment.id, kind: "PAYMENT_REQUIRED",
      payload: monthlyPaymentRequiredEmail({
        paymentId: payment.id, customerEmail: enrollment.customer.email,
        locale: enrollment.application?.locale || enrollment.customer.locale,
        learnerName: enrollment.student.fullName, courseCode: enrollment.planCodeSnapshot,
        amountCents: payment.finalAmountCents, currency: payment.currency, dueAt: payment.dueAt!,
      }),
    });
    return { enrollmentId, outcome: "CREATED" as MonthlyGenerationOutcome, paymentId: payment.id };
  });
}

export async function generateEligibleMonthlyPayments(now = new Date(), limit = 100) {
  const batchSize = Math.max(1, Math.min(limit, 100));
  // Validate only the distinct snapshots actually in use. Enumerating
  // pg_timezone_names evaluates every installed zone and is costly on Windows.
  const snapshots = await prisma.courseEnrollment.findMany({
    where: { status: "ACTIVE", archivedAt: null, billingTimeZone: { not: null } },
    select: { billingTimeZone: true }, distinct: ["billingTimeZone"],
  });
  const zones = snapshots.map(row => row.billingTimeZone).filter((zone): zone is string => Boolean(zone && isIanaTimeZone(zone)));
  if (!zones.length) return { results: [], hasMore: false };
  // Filter due candidates BEFORE LIMIT: a prefix of not-yet-due or completed
  // schedules must never starve later enrollments. PostgreSQL interval addition
  // clamps each target month from the original anchor, just like the service.
  // The locked service remains authoritative and revalidates each candidate.
  const candidates = await prisma.$queryRaw<{ id: string }[]>`
    SELECT e.id FROM "CourseEnrollment" e
    JOIN "CoursePlan" p ON p.id = e."coursePlanId"
    LEFT JOIN "CourseCohort" c ON c.id = e."cohortId"
    JOIN LATERAL (
      SELECT "periodStart" AS anchor FROM "CoursePayment"
      WHERE "enrollmentId" = e.id AND kind = 'INITIAL_ENROLLMENT' AND revision = 1
      ORDER BY "periodStart" LIMIT 1
    ) initial ON true
    JOIN LATERAL (
      SELECT MAX("periodStart") AS latest FROM "CoursePayment"
      WHERE "enrollmentId" = e.id AND revision = 1
    ) last_payment ON true
    CROSS JOIN LATERAL (SELECT (
      (EXTRACT(YEAR FROM last_payment.latest) - EXTRACT(YEAR FROM initial.anchor)) * 12
      + EXTRACT(MONTH FROM last_payment.latest) - EXTRACT(MONTH FROM initial.anchor) + 1
    )::int AS ordinal) n
    CROSS JOIN LATERAL (SELECT
      initial.anchor + make_interval(months => n.ordinal) AS next_start,
      initial.anchor + make_interval(months => n.ordinal + 1) AS next_end
    ) boundary
    WHERE e.status = 'ACTIVE' AND e."archivedAt" IS NULL
      AND p.active AND p."archivedAt" IS NULL AND p.currency = 'USD' AND p."billingInterval" = 'MONTHLY'
      AND (c."courseEndDate" IS NULL OR boundary.next_end <= c."courseEndDate")
      AND CASE WHEN e."billingTimeZone" IN (${Prisma.join(zones)})
        THEN ((boundary.next_start - interval '7 days') AT TIME ZONE e."billingTimeZone") <= ${now.toISOString()}::timestamptz
        ELSE false END
    ORDER BY boundary.next_start, e.id LIMIT ${batchSize + 1}`;
  const results = [];
  for (const candidate of candidates.slice(0, batchSize)) {
    try { results.push(await generateMonthlyPaymentForEnrollment(candidate.id, now)); }
    catch { results.push({ enrollmentId: candidate.id, outcome: "FAILED" as const }); }
  }
  return { results, hasMore: candidates.length > batchSize };
}

export async function markMonthlyPaymentPastDueInTransaction(tx: Tx, paymentId: string, now: Date) {
  await tx.$queryRaw`SELECT id FROM "CoursePayment" WHERE id = ${paymentId} FOR UPDATE`;
  const payment = await tx.coursePayment.findUnique({ where: { id: paymentId }, include: {
    submissions: { where: { status: "SUBMITTED" }, select: { id: true } },
    enrollment: { include: { customer: true, student: true, application: true } },
  } });
  if (!payment || payment.kind !== "MONTHLY" || payment.status !== "PENDING" || !payment.dueAt || payment.dueAt > now
    || payment.submissions.length || payment.enrollment.status !== "ACTIVE" || payment.enrollment.archivedAt) {
    return { paymentId, outcome: "SKIPPED" as const };
  }
  await tx.coursePayment.update({ where: { id: paymentId }, data: { status: "PAST_DUE" } });
  await enqueueCoursePaymentNotification(tx, { paymentId, kind: "MONTHLY_PAYMENT_PAST_DUE", payload: monthlyPastDueEmail({
    paymentId, customerEmail: payment.enrollment.customer.email,
    locale: payment.enrollment.application?.locale || payment.enrollment.customer.locale,
    learnerName: payment.enrollment.student.fullName, courseCode: payment.enrollment.planCodeSnapshot,
    amountCents: payment.finalAmountCents, currency: payment.currency, expiresAt: payment.expiresAt,
  }) });
  return { paymentId, outcome: "PAST_DUE" as const };
}

export function markMonthlyPaymentPastDue(paymentId: string, now = new Date()) {
  return serializable(tx => markMonthlyPaymentPastDueInTransaction(tx, paymentId, now));
}

export async function markEligibleMonthlyPaymentsPastDue(now = new Date(), limit = 100) {
  const candidates = await prisma.coursePayment.findMany({
    where: { kind: "MONTHLY", status: "PENDING", dueAt: { lte: now }, submissions: { none: { status: "SUBMITTED" } }, enrollment: { status: "ACTIVE", archivedAt: null } },
    select: { id: true }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: Math.min(limit, 100) + 1,
  });
  const results = [];
  for (const candidate of candidates.slice(0, limit)) results.push(await markMonthlyPaymentPastDue(candidate.id, now));
  return { results, hasMore: candidates.length > limit };
}
