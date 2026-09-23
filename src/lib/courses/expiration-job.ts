import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { expireInitialPayment } from "./expire-initial-payments";
import { generateInitialPaymentReminders, generateMonthlyPaymentReminders } from "./payment-reminders";
import { generateEligibleMonthlyPayments, markEligibleMonthlyPaymentsPastDue } from "./monthly-billing";
import { deliverCoursePaymentNotifications } from "@/lib/notifications/course-payment-worker";

const LIMIT = 100;
const WORK_BUDGET_MS = 20_000;

/** No client-supplied clock, targets or batch size. Every candidate is revalidated
 * under the existing serializable payment lock. Only the transition winner queues. */
export async function runInitialPaymentExpirationJob() {
  const started = performance.now();
  const now = new Date();
  const summary = {
    jobId: randomUUID(), candidates: 0, processed: 0, expired: 0, skipped: 0, failed: 0,
    notificationsCreated: 0, remindersCreated: 0, notificationsClaimed: 0,
    notificationsSent: 0, notificationsRetried: 0, notificationsFailed: 0,
    notificationsCancelled: 0, notificationsUncertain: 0,
    monthlyGenerated: 0, monthlyGenerationSkipped: 0, monthlyPartialPeriods: 0, monthlyPastDue: 0,
    deferred: 0, hasMore: false, durationMs: 0,
  };
  console.info("[course-expiration] Started", { jobId: summary.jobId });
  try {
    const generation = await generateEligibleMonthlyPayments(now, LIMIT);
    summary.monthlyGenerated = generation.results.filter(result => result.outcome === "CREATED").length;
    summary.notificationsCreated += summary.monthlyGenerated;
    summary.failed += generation.results.filter(result => result.outcome === "FAILED").length;
    summary.monthlyPartialPeriods = generation.results.filter(result => result.outcome === "PARTIAL_FINAL_PERIOD").length;
    summary.monthlyGenerationSkipped = generation.results.length - summary.monthlyGenerated;
    summary.hasMore ||= generation.hasMore;
    try {
      const reminders = await generateInitialPaymentReminders(now);
      const monthlyReminders = await generateMonthlyPaymentReminders(now);
      summary.remindersCreated = reminders.created + monthlyReminders.created;
      summary.notificationsCreated += summary.remindersCreated;
      summary.hasMore ||= reminders.hasMore || monthlyReminders.hasMore;
    } catch {
      summary.failed++;
      console.error("[course-expiration] Reminder generation failed", { jobId: summary.jobId });
    }
    // Existing status/expiresAt index bounds this query; only IDs leave the DB.
    const candidates = await prisma.coursePayment.findMany({
      where: { kind: "INITIAL_ENROLLMENT", status: "PENDING", expiresAt: { lte: now },
        enrollment: { status: "PENDING_PAYMENT", archivedAt: null, portalAccess: { is: null } } },
      select: { id: true }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: LIMIT + 1,
    });
    summary.candidates = Math.min(candidates.length, LIMIT);
    summary.hasMore ||= candidates.length > LIMIT;
    for (const candidate of candidates.slice(0, LIMIT)) {
      if (performance.now() - started >= WORK_BUDGET_MS) break;
      summary.processed++;
      try {
        const result = await expireInitialPayment(candidate.id, now);
        if (result.outcome !== "EXPIRED") { summary.skipped++; continue; }
        summary.expired++;
        // Expiration and its durable notification record committed together.
        summary.notificationsCreated++;
      } catch {
        summary.failed++;
        console.error("[course-expiration] Record failed", { jobId: summary.jobId, paymentId: candidate.id });
      }
    }
    try {
      const overdue = await markEligibleMonthlyPaymentsPastDue(now, LIMIT);
      summary.monthlyPastDue = overdue.results.filter(result => result.outcome === "PAST_DUE").length;
      summary.notificationsCreated += summary.monthlyPastDue;
      summary.hasMore ||= overdue.hasMore;
    } catch {
      summary.failed++;
      console.error("[course-expiration] Monthly past-due transition failed", { jobId: summary.jobId });
    }
    try {
      const delivery = await deliverCoursePaymentNotifications(20, now);
      summary.notificationsClaimed = delivery.claimed;
      summary.notificationsSent = delivery.sent;
      summary.notificationsRetried = delivery.retried;
      summary.notificationsFailed = delivery.failed;
      summary.notificationsCancelled = delivery.cancelled;
      summary.notificationsUncertain = delivery.uncertain;
    } catch {
      summary.failed++;
      console.error("[course-expiration] Notification worker failed", { jobId: summary.jobId });
    }
    summary.deferred = summary.candidates - summary.processed;
    summary.hasMore ||= summary.deferred > 0;
    summary.durationMs = Math.round(performance.now() - started);
    console.info("[course-expiration] Finished", summary);
    return summary;
  } catch {
    console.error("[course-expiration] Candidate query failed", { jobId: summary.jobId });
    throw new Error("Expiration job unavailable");
  }
}
