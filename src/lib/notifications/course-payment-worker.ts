import "server-only";
import { randomUUID } from "node:crypto";
import type { CoursePaymentNotificationKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendEmail } from "./email";
import { reminderWindow } from "@/lib/courses/payment-reminders";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000;
const IDEMPOTENCY_SAFETY_MS = 23 * 60 * 60 * 1000;
const PROVIDER_WAIT_MS = 5_000;
const MAX_BATCH_SIZE = 4;
const BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 8 * 60 * 60_000];

type Claimed = { id: string };

function safeErrorCode(value: string | undefined) {
  return (value || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64);
}

function eligible(kind: CoursePaymentNotificationKind, row: {
  payment: { status: string; kind: string; expiresAt: Date; enrollment: {
    status: string; archivedAt: Date | null; cancellationReason: string | null; portalAccess: unknown;
    customer: { status: string; archivedAt: Date | null; deactivatedAt: Date | null };
  } };
  submission: { status: string } | null;
}, now: Date) {
  const { payment, submission } = row;
  const enrollmentOkay = !payment.enrollment.archivedAt
    && payment.enrollment.customer.status === "ACTIVE"
    && !payment.enrollment.customer.archivedAt
    && !payment.enrollment.customer.deactivatedAt;
  if (!enrollmentOkay) return false;
  switch (kind) {
    case "PAYMENT_REQUIRED":
      return payment.status === "PENDING" && payment.enrollment.status === "PENDING_PAYMENT" && !payment.enrollment.portalAccess;
    case "PROOF_RECEIVED":
      return payment.status === "PROOF_SUBMITTED" && submission?.status === "SUBMITTED";
    case "PAYMENT_VERIFIED":
      return payment.status === "VERIFIED" && payment.enrollment.status === "ACTIVE" && Boolean(payment.enrollment.portalAccess);
    case "PROOF_REJECTED":
      return submission?.status === "REJECTED" && ["PENDING", "EXPIRED"].includes(payment.status);
    case "INITIAL_PAYMENT_REMINDER_48H":
      return payment.kind === "INITIAL_ENROLLMENT" && payment.status === "PENDING"
        && payment.enrollment.status === "PENDING_PAYMENT" && !payment.enrollment.portalAccess
        && reminderWindow(payment.expiresAt, now) === 48;
    case "INITIAL_PAYMENT_REMINDER_24H":
      return payment.kind === "INITIAL_ENROLLMENT" && payment.status === "PENDING"
        && payment.enrollment.status === "PENDING_PAYMENT" && !payment.enrollment.portalAccess
        && reminderWindow(payment.expiresAt, now) === 24;
    case "INITIAL_PAYMENT_EXPIRED":
      return payment.kind === "INITIAL_ENROLLMENT" && payment.status === "EXPIRED"
        && payment.enrollment.status === "CANCELLED"
        && payment.enrollment.cancellationReason === "INITIAL_PAYMENT_EXPIRED"
        && !payment.enrollment.portalAccess;
  }
}

async function sendWithTimeout(input: Parameters<typeof sendEmail>[0]) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      sendEmail(input),
      new Promise<Awaited<ReturnType<typeof sendEmail>>>(resolve => {
        timer = setTimeout(() => resolve({ sent: false, errorCode: "PROVIDER_TIMEOUT", retryable: true }), PROVIDER_WAIT_MS);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function deliverCoursePaymentNotifications(limit = 20, now = new Date()) {
  // Keep the claim itself bounded to what this invocation can actually attempt.
  // Claiming a larger batch and abandoning it at a wall-clock deadline would
  // consume attempt counters for messages that were never offered to Resend.
  const batchLimit = Math.min(Math.max(limit, 1), MAX_BATCH_SIZE);
  const summary = { claimed: 0, sent: 0, retried: 0, failed: 0, cancelled: 0, uncertain: 0 };
  const sender = process.env.RESEND_FROM_EMAIL;
  if (!sender || !process.env.RESEND_API_KEY) return { ...summary, configurationUnavailable: true };

  const cutoff = new Date(now.getTime() - IDEMPOTENCY_SAFETY_MS);
  await prisma.coursePaymentNotification.updateMany({
    where: {
      firstAttemptAt: { lte: cutoff },
      OR: [
        { status: "RETRY" },
        { status: "PROCESSING", leaseExpiresAt: { lte: now } },
      ],
    },
    data: { status: "FAILED", leaseToken: null, leaseExpiresAt: null, lastErrorCode: "IDEMPOTENCY_WINDOW_EXPIRED" },
  });

  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  const claimed = await prisma.$queryRaw<Claimed[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "CoursePaymentNotification"
      WHERE (
        ("status" IN ('PENDING', 'RETRY') AND "nextAttemptAt" <= ${now})
        OR ("status" = 'PROCESSING' AND "leaseExpiresAt" <= ${now})
      )
      AND "attemptCount" < ${MAX_ATTEMPTS}
      AND ("firstAttemptAt" IS NULL OR "firstAttemptAt" > ${cutoff})
      ORDER BY "nextAttemptAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchLimit}
    )
    UPDATE "CoursePaymentNotification" AS notification
    SET "status" = 'PROCESSING',
        "leaseToken" = ${leaseToken}::uuid,
        "leaseExpiresAt" = ${leaseExpiresAt},
        "senderEmailSnapshot" = COALESCE(notification."senderEmailSnapshot", ${sender}),
        "attemptCount" = notification."attemptCount" + 1,
        "firstAttemptAt" = COALESCE(notification."firstAttemptAt", ${now}),
        "lastAttemptAt" = ${now},
        "lastErrorCode" = NULL,
        "updatedAt" = ${now}
    FROM candidates
    WHERE notification."id" = candidates."id"
    RETURNING notification."id"
  `;
  summary.claimed = claimed.length;
  const rows = await prisma.coursePaymentNotification.findMany({
    where: { id: { in: claimed.map(row => row.id) }, leaseToken },
    include: {
      submission: { select: { status: true } },
      payment: { include: { enrollment: { include: { customer: true, portalAccess: true } } } },
    },
    orderBy: { id: "asc" },
  });

  for (const row of rows) {
    if (!eligible(row.kind, row, now)) {
      await prisma.coursePaymentNotification.updateMany({
        where: { id: row.id, status: "PROCESSING", leaseToken },
        data: { status: "CANCELLED", leaseToken: null, leaseExpiresAt: null, lastErrorCode: "STATE_NOT_ELIGIBLE" },
      });
      summary.cancelled++;
      continue;
    }
    const result = await sendWithTimeout({
      from: row.senderEmailSnapshot!,
      to: row.recipientEmailSnapshot,
      subject: row.subjectSnapshot,
      html: row.htmlSnapshot,
      idempotencyKey: `course-payment-notification/${row.id}`,
      redactErrors: true,
    });
    if (result.sent && result.providerMessageId) {
      try {
        const updated = await prisma.coursePaymentNotification.updateMany({
          where: { id: row.id, status: "PROCESSING", leaseToken },
          data: {
            status: "SENT", sentAt: new Date(), providerMessageId: result.providerMessageId,
            leaseToken: null, leaseExpiresAt: null, lastErrorCode: null,
          },
        });
        if (updated.count === 1) summary.sent++; else summary.uncertain++;
      } catch {
        // Provider may have accepted the message. Preserve the lease; a later
        // worker retries the identical payload/key within Resend's 24h window.
        summary.uncertain++;
      }
      continue;
    }
    const retry = result.retryable === true && row.attemptCount < MAX_ATTEMPTS
      && row.firstAttemptAt!.getTime() > cutoff.getTime();
    const backoff = BACKOFF_MS[Math.min(row.attemptCount - 1, BACKOFF_MS.length - 1)]!;
    await prisma.coursePaymentNotification.updateMany({
      where: { id: row.id, status: "PROCESSING", leaseToken },
      data: {
        status: retry ? "RETRY" : "FAILED",
        nextAttemptAt: retry ? new Date(now.getTime() + backoff) : row.nextAttemptAt,
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: safeErrorCode(result.errorCode),
      },
    });
    if (retry) summary.retried++; else summary.failed++;
  }
  return { ...summary, configurationUnavailable: false };
}
