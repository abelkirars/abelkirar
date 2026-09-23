import "server-only";

import { prisma } from "@/lib/db";
import { getOrCreateCurrentCustomer } from "./dal";
import { CoursePaymentCustomerDeniedError } from "@/lib/courses/course-payment-access";

/** Verified Supabase identity only. No email matching or learner impersonation. */
export async function getCurrentAccountOverview() {
  const customer = await getOrCreateCurrentCustomer();
  if (customer.status !== "ACTIVE" || customer.archivedAt || customer.deactivatedAt) {
    throw new CoursePaymentCustomerDeniedError("Account unavailable");
  }
  const [learners, enrollments, orders] = await Promise.all([
    prisma.customerStudentRelation.findMany({
      where: { customerId: customer.id, type: "GUARDIAN", endedAt: null, archivedAt: null },
      select: { id: true, student: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
    prisma.courseEnrollment.findMany({
      where: { customerId: customer.id },
      select: {
        id: true, status: true, planCodeSnapshot: true, billingTimeZone: true,
        student: { select: { id: true, fullName: true } },
        cohort: { select: { name: true, weeklyDay: true, localStartTime: true, timeZone: true } },
      },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
    prisma.order.findMany({
      // Deliberately excludes guest/historical orders with only an email match.
      where: { customerId: customer.id },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true, total: true, currency: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
  ]);
  return { profile: { email: customer.email, fullName: customer.fullName }, learners, enrollments, orders };
}
