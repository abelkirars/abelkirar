import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { COURSE_LEVELS, courseOverviewItems } from "@/lib/courses-data";
import { CoursePrice } from "@/components/marketing/course-price";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CourseApplicationForm } from "@/components/forms/course-application-form";

export function generateStaticParams() {
  return COURSE_LEVELS.map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/courses/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const course = COURSE_LEVELS.find((c) => c.slug === slug);
  if (!course) return {};
  const tLevels = await getTranslations("courseLevels");
  return {
    title: `${tLevels(`${course.slug}.title`)} Kirar Course`,
    description: tLevels(`${course.slug}.description`),
  };
}

export default async function CourseDetailPage({
  params,
}: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  const course = COURSE_LEVELS.find((c) => c.slug === slug);
  if (!course) notFound();
  const t = await getTranslations("courses");
  const tForm = await getTranslations("courseApplicationForm");
  // The same namespace the cards on /courses read, so a level's name and
  // description are written once and shown identically in both places.
  const tLevels = await getTranslations("courseLevels");
  const tDetails = await getTranslations("courseDetails");

  // Blank slots are dropped rather than rendered as an empty bullet: clearing
  // a topic in the editor is how you end up with a two-point course.
  const topics = courseOverviewItems((slot) => tDetails(`${course.slug}.topic${slot}`));

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-16 text-[#f3e9d2] sm:py-32">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <Badge variant="secondary" className="w-fit">
            {tLevels(`${course.slug}.level`)}
          </Badge>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {tLevels(`${course.slug}.title`)}: {tLevels(`${course.slug}.tagline`)}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[#f3e9d2]/80 text-pretty">
            {tLevels(`${course.slug}.description`)}
          </p>
          {/* The price stays visible so an applicant can self-qualify before
              applying; the apply CTA sits beneath it rather than replacing it. */}
          <div className="mt-6 text-[#d4a84b]">
            <CoursePrice slug={course.slug} />
          </div>
          <Button
            size="lg"
            className="mt-6"
            nativeButton={false}
            render={<Link href="#apply" />}
          >
            {t("waitlistLabel")}
          </Button>
        </Container>
      </section>

      <section className="py-14 sm:py-24">
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-heading text-2xl font-semibold">
              {t("overviewHeading")}
            </h2>
            <ul className="mt-6 space-y-3">
              {topics.map(({ slot, text }) => (
                <li key={slot} className="flex items-start gap-3">
                  <Check className="mt-1 size-4 shrink-0 text-accent" />
                  <span className="text-muted-foreground">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            id="apply"
            className="h-fit max-w-md scroll-mt-[calc(var(--header-height)+1rem)] rounded-2xl bg-card p-8 ring-1 ring-foreground/10"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-accent">
              {tForm("eyebrow")}
            </p>
            <h2 className="font-heading text-xl font-semibold">{tForm("title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{tForm("description")}</p>
            {/* The level pre-fill is deliberate: it reflects the course page
                the applicant chose to open, so someone who navigated to
                /courses/intermediate is not asked to state their level twice.
                It is a starting point, not a lock — "Not sure yet" and the
                other levels remain selectable, which is what keeps a wrong
                guess from being silently confirmed. */}
            <div className="mt-6">
              <CourseApplicationForm defaultRequestedLevel={course.studentLevel} />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
