import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { expireInitialPayment } from "./expire-initial-payments";
import { notifyCoursePaymentExpired } from "@/lib/notifications/course-payment-expired";

const LIMIT = 100;
const WORK_BUDGET_MS = 30_000;
const EMAIL_WAIT_MS = 5_000;

/** One notification attempt, not a retry/outbox. Timeout means outcome unknown. */
async function attemptNotification(paymentId: string): Promise<"sent" | "failed" | "unknown"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      notifyCoursePaymentExpired(paymentId).then(result => result.sent ? "sent" as const : "failed" as const),
      new Promise<"unknown">(resolve => { timer = setTimeout(() => resolve("unknown"), EMAIL_WAIT_MS); }),
    ]);
  } catch { return "failed"; }
  finally { clearTimeout(timer); }
}

/** No client-supplied clock, targets or batch size. Every candidate is revalidated
 * under the existing serializable payment lock. Only the transition winner emails. */
export async function runInitialPaymentExpirationJob() {
  const started = performance.now();
  const now = new Date();
  const summary = {
    jobId: randomUUID(), candidates: 0, processed: 0, expired: 0, skipped: 0, failed: 0,
    emailAccepted: 0, emailFailed: 0, emailUnknown: 0, deferred: 0, hasMore: false, durationMs: 0,
  };
  console.info("[course-expiration] Started", { jobId: summary.jobId });
  try {
    // Existing status/expiresAt index bounds this query; only IDs leave the DB.
    const candidates = await prisma.coursePayment.findMany({
      where: { kind: "INITIAL_ENROLLMENT", status: "PENDING", expiresAt: { lte: now },
        enrollment: { status: "PENDING_PAYMENT", archivedAt: null, portalAccess: { is: null } } },
      select: { id: true }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: LIMIT + 1,
    });
    summary.candidates = Math.min(candidates.length, LIMIT);
    summary.hasMore = candidates.length > LIMIT;
    for (const candidate of candidates.slice(0, LIMIT)) {
      if (performance.now() - started >= WORK_BUDGET_MS) break;
      summary.processed++;
      try {
        const result = await expireInitialPayment(candidate.id, now);
        if (result.outcome !== "EXPIRED") { summary.skipped++; continue; }
        summary.expired++;
        // The domain promise has committed. Email can never undo expiration.
        const delivery = await attemptNotification(candidate.id);
        if (delivery === "sent") summary.emailAccepted++;
        else {
          if (delivery === "unknown") summary.emailUnknown++;
          else summary.emailFailed++;
          console.warn("[course-expiration] Notification not confirmed", { jobId: summary.jobId, paymentId: candidate.id, outcome: delivery });
        }
      } catch {
        summary.failed++;
        console.error("[course-expiration] Record failed", { jobId: summary.jobId, paymentId: candidate.id });
      }
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
