import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/admin/dal";
import { prisma } from "@/lib/db";
import { listAdminPromotions } from "@/lib/courses/promotions";
import { CoursePromotionForm } from "@/components/admin/course-promotion-form";
import { Container } from "@/components/marketing/container";

export default async function PromotionsPage() {
  await requireAdminPage();
  const [t, promotions, plans] = await Promise.all([getTranslations("coursePromotionAdmin"), listAdminPromotions(), prisma.coursePlan.findMany({ where: { active: true, archivedAt: null }, select: { id: true, code: true }, orderBy: { displayOrder: "asc" } })]);
  return <Container className="max-w-4xl space-y-8 py-10"><h1 className="font-heading text-3xl">{t("title")}</h1><CoursePromotionForm plans={plans} />
    <section className="space-y-4"><h2 className="font-heading text-xl">{t("history")}</h2>{promotions.map(promotion => <article key={promotion.id} className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">{promotion.name} · {promotion.coursePlan.code}</h3><p>{promotion.discountValue} {t(promotion.discountType === "PERCENT" ? "percent" : "fixed")}</p><p className="text-sm">{promotion.startsAt.toISOString()} – {promotion.endsAt.toISOString()}</p><p>{t(promotion.cancelledAt ? "cancelled" : !promotion.enabled ? "disabled" : promotion.endsAt <= new Date() ? "ended" : "enabled")}</p>{!promotion.cancelledAt && promotion.endsAt > new Date() && <CoursePromotionForm cancelId={promotion.id} />}</article>)}</section>
  </Container>;
}
