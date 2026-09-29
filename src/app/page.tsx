import { getTranslations } from "next-intl/server";
import { readCatalog, productImages } from "@/lib/catalog";
import { INSTRUMENT_CATEGORIES } from "@/lib/instrument-categories";
import { Suspense } from "react";
import { PublishedMedia } from "@/components/marketing/site-media";
import { KirarHero } from "@/components/marketing/kirar-hero";
import { MissionSection } from "@/components/marketing/mission-section";
import { CourseLevelCards } from "@/components/marketing/course-level-cards";
import { InstrumentShowcase, type ShowcaseInstrument } from "@/components/marketing/instrument-showcase";
import { CommunityCta } from "@/components/marketing/community-cta";
import { Container } from "@/components/marketing/container";
import { HomeSectionHeading } from "@/components/marketing/home-section-heading";
import motion from "@/components/motion/motion.module.css";
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
    // Hosted photos only: `/products-to-upload/` files are upload staging,
    // not production imagery. An instrument without one gets the showcase's
    // line drawing instead.
    const images = productImages(product.images).filter((src) => src.startsWith("https://"));
    if (images.length > 0) {
      imagesByCategory[product.category] = images;
    }
  }
  return imagesByCategory;
}

async function HomeInstrumentShowcase({ withImages = true }: { withImages?: boolean }) {
  const [t, imagesByCategory] = await Promise.all([
    getTranslations("instrumentCategories"),
    withImages ? getInstrumentCategoryImages() : Promise.resolve<Record<string, string[]>>({}),
  ]);
  const instruments: ShowcaseInstrument[] = INSTRUMENT_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    href: `/store?category=${category.id}`,
    shopLabel: t("shopCategory", { category: category.name }),
    image: imagesByCategory[category.id]?.[0],
    imageAlt: t("imageAlt", { category: category.name }),
  }));
  return <InstrumentShowcase instruments={instruments} tabsLabel={t("tabsLabel")} />;
}

export default async function Home() {
  const t = await getTranslations("home");

  return (
    <>
      <KirarHero />
      <Suspense fallback={null}><PublishedMedia slot="home-performance" /></Suspense>

      <section className={`${motion.scope} bg-muted/40 py-14 sm:py-24`}>
        <Container>
          <HomeSectionHeading
            eyebrow={t("coursesEyebrow")}
            title={t("coursesTitle")}
            description={t("coursesDescription")}
          />
          <div className="mt-10">
            <CourseLevelCards motion />
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-24">
        <Container>
          <HomeSectionHeading
            eyebrow={t("instrumentsEyebrow")}
            title={t("instrumentsTitle")}
            description={t("instrumentsDescription")}
          />
          <div className="mt-10">
            <Suspense fallback={<HomeInstrumentShowcase withImages={false} />}>
              <HomeInstrumentShowcase />
            </Suspense>
          </div>
        </Container>
      </section>

      <MissionSection />
      <CommunityCta />
    </>
  );
}
