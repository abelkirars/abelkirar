import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/admin/dal";
import { COURSE_LEVELS } from "@/lib/courses-data";
import { getCoursePricing } from "@/lib/course-pricing";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { CoursePriceForm } from "@/components/admin/course-price-form";

export default async function CoursePricingPage() {
  await requireAdminPage();
  const t = await getTranslations("coursePricing");
  const levels = await getTranslations("courseLevels");
  const courses = await Promise.all(COURSE_LEVELS.map(async (course) => {
    const row = await prisma.coursePrice.findUnique({ where: { slug: course.slug } });
    const input = row ?? { priceCents: course.price, discountType: null, discountValue: null, discountActive: false };
    return { course, input, pricing: await getCoursePricing(course.slug, input) };
  }));
  return (
    <Container className="py-10">
      <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("description")}</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {courses.map(({ course, input, pricing }) => (
          <CoursePriceForm key={course.slug} slug={course.slug} title={levels(`${course.slug}.title`)} initial={input} initialPricing={pricing} />
        ))}
      </div>
    </Container>
  );
}
