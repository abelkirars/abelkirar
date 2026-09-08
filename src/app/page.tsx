import { getTranslations } from "next-intl/server";
import { readCatalog, productImages } from "@/lib/catalog";
import { INSTRUMENT_CATEGORIES } from "@/lib/instrument-categories";
import { Suspense } from "react";
import { PublishedMedia } from "@/components/marketing/site-media";
import { Hero } from "@/components/marketing/hero";
import { MissionSection } from "@/components/marketing/mission-section";
import { CourseLevelCards } from "@/components/marketing/course-level-cards";
import { InstrumentCategoryCards } from "@/components/marketing/instrument-category-cards";
import { CommunityCta } from "@/components/marketing/community-cta";
import { Container } from "@/components/marketing/container";
import { SectionHeading } from "@/components/marketing/section-heading";
import type { ProductCategory } from "@prisma/client";

// Flat ceiling across all three categories combined, not per category —
// limited to 30 rows. Products can't be reordered in
// admin today, so if the earliest product in a category has no photo, a
// later one might; this looks far enough to usually find it without
// scanning the whole catalogue. If the catalogue ever outgrows what 30 rows
// can cover for every category, the fallback is the gradient block already
// showing today — not a broken page.
const CANDIDATE_LIMIT = 30;

async function getInstrumentCategoryImages(): Promise<Record<string, string[]>> {
  const categoryIds = INSTRUMENT_CATEGORIES.map((c) => c.id);

  const { products: candidates } = await readCatalog({
      category: { in: categoryIds as ProductCategory[] },
  }, CANDIDATE_LIMIT);

  const imagesByCategory: Record<string, string[]> = {};
  for (const product of candidates.slice(0, CANDIDATE_LIMIT)) {
    if (imagesByCategory[product.category]) continue; // already found this category's photo
    const images = productImages(product.images);
    if (images.length > 0) {
      imagesByCategory[product.category] = images;
    }
  }
  return imagesByCategory;
}

async function HomeInstrumentCategories() {
  return <InstrumentCategoryCards imagesByCategory={await getInstrumentCategoryImages()} />;
}

export default async function Home() {
  const t = await getTranslations("home");

  return (
    <>
      <Hero />
      <Suspense fallback={null}><PublishedMedia slot="home-performance" /></Suspense>

      <section className="bg-muted/40 py-14 sm:py-24">
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

      <section className="py-14 sm:py-24">
        <Container>
          <SectionHeading
            eyebrow={t("instrumentsEyebrow")}
            title={t("instrumentsTitle")}
            description={t("instrumentsDescription")}
            align="center"
            className="mx-auto"
          />
          <div className="mt-12">
            <Suspense fallback={<InstrumentCategoryCards imagesByCategory={{}} />}>
              <HomeInstrumentCategories />
            </Suspense>
          </div>
        </Container>
      </section>

      <MissionSection />
      <CommunityCta />
    </>
  );
}
