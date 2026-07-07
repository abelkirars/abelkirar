import { Hero } from "@/components/marketing/hero";
import { MissionSection } from "@/components/marketing/mission-section";
import { CourseLevelCards } from "@/components/marketing/course-level-cards";
import { InstrumentCategoryCards } from "@/components/marketing/instrument-category-cards";
import { CommunityCta } from "@/components/marketing/community-cta";
import { Container } from "@/components/marketing/container";
import { SectionHeading } from "@/components/marketing/section-heading";

export default function Home() {
  return (
    <>
      <Hero />
      <MissionSection />

      <section className="bg-muted/40 py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow="Online Courses"
            title="A curriculum built for every stage"
            description="From your first scale to leading worship, structured for the Ethiopian and Eritrean diaspora — kids and adults alike."
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
            eyebrow="Handmade Instruments"
            title="Instruments built for worship, made to order"
            description="Kirar, Begena, and Masenqo, customized in shape, finish, and size, and shipped to the US, UK, and Europe."
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
