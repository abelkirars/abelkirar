import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { INSTRUMENT_CATEGORIES } from "@/lib/instrument-categories";
import { Hero } from "@/components/marketing/hero";
import { MissionSection } from "@/components/marketing/mission-section";
import { CourseLevelCards } from "@/components/marketing/course-level-cards";
import { InstrumentCategoryCards } from "@/components/marketing/instrument-category-cards";
import { CommunityCta } from "@/components/marketing/community-cta";
import { Container } from "@/components/marketing/container";
import { SectionHeading } from "@/components/marketing/section-heading";
import type { ProductCategory } from "@prisma/client";

// Flat ceiling across all three categories combined, not per category —
// trivial to fetch (two columns, 30 rows). Products can't be reordered in
// admin today, so if the earliest product in a category has no photo, a
// later one might; this looks far enough to usually find it without
// scanning the whole catalogue. If the catalogue ever outgrows what 30 rows
// can cover for every category, the fallback is the gradient block already
// showing today — not a broken page.
const CANDIDATE_LIMIT = 30;

async function getInstrumentCategoryImages(): Promise<Record<string, string[]>> {
  const categoryIds = INSTRUMENT_CATEGORIES.map((c) => c.id);

  const candidates = await prisma.product.findMany({
    where: {
      category: { in: categoryIds as ProductCategory[] },
      isActive: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], // same "first" /store uses
    select: { category: true, images: true },
    take: CANDIDATE_LIMIT,
  });

  const imagesByCategory: Record<string, string[]> = {};
  for (const product of candidates) {
    if (imagesByCategory[product.category]) continue; // already found this category's photo
    const images = product.images as string[];
    if (images.length > 0) {
      imagesByCategory[product.category] = images;
    }
  }
  return imagesByCategory;
}

export default async function Home() {
  const t = await getTranslations("home");
  const imagesByCategory = await getInstrumentCategoryImages();

  return (
    <>
      <Hero />
      <MissionSection />

      <section className="bg-muted/40 py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow={t("coursesEyebrow")}
            title={t("coursesTitle")}
            description={t("coursesDescription")}
            align="center"
            className="mx-auto"
          />
          <div className="mt-12">
            <CourseLevelCards />
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow={t("instrumentsEyebrow")}
            title={t("instrumentsTitle")}
            description={t("instrumentsDescription")}
            align="center"
            className="mx-auto"
          />
          <div className="mt-12">
            <InstrumentCategoryCards imagesByCategory={imagesByCategory} />
          </div>
        </Container>
      </section>

      <CommunityCta />
    </>
  );
}
