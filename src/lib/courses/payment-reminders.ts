import "server-only";
import { prisma } from "@/lib/db";
import { enqueueCoursePaymentNotification } from "@/lib/notifications/course-payment-outbox";
import { monthlyReminderEmail, paymentReminderEmail } from "@/lib/notifications/course-payment-content";

const HOUR = 60 * 60 * 1000;
const LIMIT = 100;

/** Deliberately non-overlapping useful windows for an hourly scheduler:
 * 48h reminder: >36h and <=48h remaining; 24h: >12h and <=24h remaining.
 * Missed windows stay missed instead of generating stale/double reminders. */
export function reminderWindow(expiresAt: Date, now: Date): 48 | 24 | null {
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining > 36 * HOUR && remaining <= 48 * HOUR) return 48;
  if (remaining > 12 * HOUR && remaining <= 24 * HOUR) return 24;
  return null;
}

export function monthlyReminderWindow(dueAt: Date, now: Date): 72 | 24 | null {
  const remaining = dueAt.getTime() - now.getTime();
  if (remaining > 48 * HOUR && remaining <= 72 * HOUR) return 72;
  if (remaining > 12 * HOUR && remaining <= 24 * HOUR) return 24;
  return null;
}

export async function generateInitialPaymentReminders(now = new Date()) {
  const plus = (hours: number) => new Date(now.getTime() + hours * HOUR);
  const payments = await prisma.coursePayment.findMany({
    where: {
      kind: "INITIAL_ENROLLMENT",
      status: "PENDING",
      OR: [
        { expiresAt: { gt: plus(36), lte: plus(48) }, notifications: { none: { kind: "INITIAL_PAYMENT_REMINDER_48H" } } },
        { expiresAt: { gt: plus(12), lte: plus(24) }, notifications: { none: { kind: "INITIAL_PAYMENT_REMINDER_24H" } } },
      ],
      enrollment: {
        status: "PENDING_PAYMENT", archivedAt: null, portalAccess: { is: null },
        customer: { status: "ACTIVE", archivedAt: null, deactivatedAt: null },
      },
    },
    include: { enrollment: { include: { customer: true, student: true, application: true } } },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: LIMIT + 1,
  });
  let created = 0;
  let duplicate = 0;
  for (const payment of payments.slice(0, LIMIT)) {
    const hours = reminderWindow(payment.expiresAt, now);
    if (!hours) continue;
    const enrollment = payment.enrollment;
    const inserted = await enqueueCoursePaymentNotification(prisma, {
      paymentId: payment.id,
      kind: hours === 48 ? "INITIAL_PAYMENT_REMINDER_48H" : "INITIAL_PAYMENT_REMINDER_24H",
      payload: paymentReminderEmail({
        paymentId: payment.id,
        customerEmail: enrollment.customer.email,
        locale: enrollment.application?.locale || enrollment.customer.locale,
        learnerName: enrollment.student.fullName,
        courseCode: enrollment.planCodeSnapshot,
        amountCents: payment.finalAmountCents,
        currency: payment.currency,
        deadline: payment.expiresAt,
        hours,
      }),
    });
    if (inserted) created++; else duplicate++;
  }
  return { candidates: Math.min(payments.length, LIMIT), created, duplicate, hasMore: payments.length > LIMIT };
}

export async function generateMonthlyPaymentReminders(now = new Date()) {
  const plus = (hours: number) => new Date(now.getTime() + hours * HOUR);
  const payments = await prisma.coursePayment.findMany({ where: {
    kind: "MONTHLY", status: "PENDING",
    submissions: { none: { status: "SUBMITTED" } },
    OR: [
      { dueAt: { gt: plus(48), lte: plus(72) }, notifications: { none: { kind: "MONTHLY_PAYMENT_REMINDER_72H" } } },
      { dueAt: { gt: plus(12), lte: plus(24) }, notifications: { none: { kind: "MONTHLY_PAYMENT_REMINDER_24H" } } },
    ],
    enrollment: { status: "ACTIVE", archivedAt: null, customer: { status: "ACTIVE", archivedAt: null, deactivatedAt: null } },
  }, include: { enrollment: { include: { customer: true, student: true, application: true } } },
  orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: LIMIT + 1 });
  let created = 0, duplicate = 0;
  for (const payment of payments.slice(0, LIMIT)) {
    const hours = monthlyReminderWindow(payment.dueAt!, now);
    if (!hours) continue;
    const enrollment = payment.enrollment;
    const inserted = await enqueueCoursePaymentNotification(prisma, {
      paymentId: payment.id, kind: hours === 72 ? "MONTHLY_PAYMENT_REMINDER_72H" : "MONTHLY_PAYMENT_REMINDER_24H",
      payload: monthlyReminderEmail({ paymentId: payment.id, customerEmail: enrollment.customer.email,
        locale: enrollment.application?.locale || enrollment.customer.locale, learnerName: enrollment.student.fullName,
        courseCode: enrollment.planCodeSnapshot, amountCents: payment.finalAmountCents, currency: payment.currency,
        dueAt: payment.dueAt!, hours }),
    });
    if (inserted) created++; else duplicate++;
  }
  return { candidates: Math.min(payments.length, LIMIT), created, duplicate, hasMore: payments.length > LIMIT };
}
