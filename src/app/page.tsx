import { getTranslations } from "next-intl/server";
import { Hero } from "@/components/marketing/hero";
import { MissionSection } from "@/components/marketing/mission-section";
import { CourseLevelCards } from "@/components/marketing/course-level-cards";
import { InstrumentCategoryCards } from "@/components/marketing/instrument-category-cards";
import { CommunityCta } from "@/components/marketing/community-cta";
import { Container } from "@/components/marketing/container";
import { SectionHeading } from "@/components/marketing/section-heading";

export default async function Home() {
  const t = await getTranslations("home");

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
            <InstrumentCategoryCards />
          </div>
        </Container>
      </section>

      <CommunityCta />
    </>
  );
}
