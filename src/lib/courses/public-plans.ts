import "server-only";
import { prisma } from "@/lib/db";
import { paymentPriceSnapshot } from "./course-payment-pricing";

export async function getPublicCoursePlans(now = new Date()) {
  const plans = await prisma.coursePlan.findMany({
    where: { active: true, archivedAt: null }, orderBy: { displayOrder: "asc" },
    include: { promotions: { where: { enabled: true, cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } } } },
  });
  return plans.map(plan => {
    if (plan.promotions.length > 1) throw new Error("Ambiguous course pricing");
    const promotion = plan.promotions[0] ?? null;
    const snapshot = paymentPriceSnapshot(plan.monthlyPriceCents, plan.currency, promotion);
    return {
      id: plan.id, code: plan.code, level: plan.level, format: plan.format,
      baseAmountCents: snapshot.baseAmountCents, finalAmountCents: snapshot.finalAmountCents, currency: snapshot.currency,
      groupMinimumStudents: plan.groupMinimumStudents, groupMaximumStudents: plan.groupMaximumStudents,
      promotion: promotion ? { endsAt: promotion.endsAt.toISOString(), publicCountdownEnabled: promotion.publicCountdownEnabled } : null,
    };
  });
}
export type PublicCoursePlan = Awaited<ReturnType<typeof getPublicCoursePlans>>[number];
