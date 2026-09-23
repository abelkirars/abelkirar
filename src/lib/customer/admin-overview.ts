import "server-only";
import { prisma } from "@/lib/db";
import { courseAdmin } from "@/lib/courses/admin-service";

export async function listAdminCustomers(page: number) {
  await courseAdmin();
  const safePage = Number.isSafeInteger(page) && page >= 1 && page <= 10000 ? page : 1;
  return prisma.customer.findMany({
    select: { id: true, fullName: true, email: true, status: true, archivedAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (safePage - 1) * 50, take: 51,
  });
}

export async function getAdminCustomerOverview(id: string) {
  await courseAdmin();
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true, fullName: true, email: true, status: true, deactivatedAt: true, archivedAt: true,
      studentRelations: { select: { id: true, type: true, endedAt: true, archivedAt: true, student: { select: { id: true, fullName: true } } }, take: 100 },
      applications: { select: { id: true, fullName: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 },
      enrollments: { select: { id: true, status: true, planCodeSnapshot: true, student: { select: { fullName: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
      orders: { select: { id: true, orderNumber: true, paymentStatus: true, currency: true, total: true }, orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!customer) return null;
  const [payments, verifiedCourse, paidStore] = await Promise.all([
    prisma.coursePayment.findMany({
      where: { enrollment: { customerId: id } }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, kind: true, status: true, currency: true, finalAmountCents: true, periodStart: true, periodEnd: true,
        submissions: { select: { id: true, status: true, submittedAt: true, method: true }, orderBy: { submittedAt: "desc" }, take: 10 } },
    }),
    prisma.coursePayment.groupBy({ by: ["currency"], where: { enrollment: { customerId: id }, status: "VERIFIED", verifiedAt: { not: null } }, _sum: { finalAmountCents: true } }),
    prisma.order.groupBy({ by: ["currency"], where: { customerId: id, paymentStatus: "PAID", paymentConfirmedAt: { not: null } }, _sum: { total: true } }),
  ]);
  return { customer, payments, verifiedCourse, paidStore };
}
