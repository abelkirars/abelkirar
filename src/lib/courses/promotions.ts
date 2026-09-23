import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { courseAdmin, serializable } from "./admin-service";
import { paymentPriceSnapshot } from "./course-payment-pricing";

export class PromotionConflictError extends Error {}
export const promotionSchema = z.object({
  coursePlanId: z.string().min(1).max(100), name: z.string().trim().min(1).max(150),
  discountType: z.enum(["PERCENT", "FIXED"]), discountValue: z.number().int().positive().max(2147483647),
  startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), publicCountdownEnabled: z.boolean(),
}).strict().refine(value => Date.parse(value.endsAt) > Date.parse(value.startsAt), "End must follow start");

export async function listAdminPromotions() {
  await courseAdmin();
  return prisma.coursePromotion.findMany({ include: { coursePlan: { select: { code: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function createPromotion(raw: unknown) {
  await courseAdmin();
  const input = promotionSchema.parse(raw);
  try { return await serializable(async tx => {
    // Serialize plan scheduling, including empty ranges; the exclusion constraint
    // remains the authoritative concurrent protection for every other writer.
    await tx.$queryRaw`SELECT id FROM "CoursePlan" WHERE id = ${input.coursePlanId} FOR UPDATE`;
    const plan = await tx.coursePlan.findUnique({ where: { id: input.coursePlanId } });
    if (!plan || !plan.active || plan.archivedAt) throw new Error("Plan unavailable");
    paymentPriceSnapshot(plan.monthlyPriceCents, plan.currency, { id: "validation", ...input });
    const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
    if (endsAt <= new Date()) throw new Error("Promotion must end in the future");
    const overlap = await tx.coursePromotion.findFirst({ where: {
      coursePlanId: plan.id, enabled: true, cancelledAt: null,
      startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
    } });
    if (overlap) throw new PromotionConflictError("This plan already has an active promotion during part of this period.");
    return tx.coursePromotion.create({ data: { ...input, startsAt, endsAt, enabled: true } });
  }); } catch (error) {
    // Prisma's adapter can surface exclusion violations as an unknown request
    // error. Match only our exact named constraint; never return engine details.
    if (error instanceof Error && error.message.includes("CoursePromotion_no_enabled_overlap")) {
      throw new PromotionConflictError("This plan already has an active promotion during part of this period.");
    }
    throw error;
  }
}

export async function cancelPromotion(id: string) {
  await courseAdmin();
  z.string().min(1).max(100).parse(id);
  // Never delete or rewrite issued CoursePayment snapshots.
  return prisma.coursePromotion.updateMany({ where: { id, cancelledAt: null }, data: { enabled: false, cancelledAt: new Date() } });
}
