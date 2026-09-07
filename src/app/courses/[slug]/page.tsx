import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { COURSE_LEVELS } from "@/lib/courses-data";
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
  return {
    title: `${course.title} Kirar Course`,
    description: course.description,
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

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-16 text-[#f3e9d2] sm:py-32">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <Badge variant="secondary" className="w-fit">
            {course.level}
          </Badge>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {course.title}: {course.tagline}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[#f3e9d2]/80 text-pretty">
            {course.description}
          </p>
          {/* The price stays visible so an applicant can self-qualify before
              applying; the apply CTA sits beneath it rather than replacing it. */}
          <p className="mt-6 font-heading text-2xl text-[#d4a84b]">
            ${(course.price / 100).toFixed(0)}
          </p>
          <p className="mt-4 max-w-xl text-sm text-[#f3e9d2]/80">{t("availability")}</p>
          <p className="mt-4 max-w-xl text-sm text-[#f3e9d2]/80">{t("strings")}</p>
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
              {course.topics.map((topic) => (
                <li key={topic} className="flex items-start gap-3">
                  <Check className="mt-1 size-4 shrink-0 text-accent" />
                  <span className="text-muted-foreground">{topic}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            id="apply"
            className="h-fit max-w-md scroll-mt-20 rounded-2xl bg-card p-8 ring-1 ring-foreground/10"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-accent">
              {tForm("eyebrow")}
            </p>
            <h2 className="font-heading text-xl font-semibold">{tForm("title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{tForm("description")}</p>
            {/* No level pre-fill: an applicant on /courses/beginner must choose
                their level deliberately rather than confirm the page's guess. */}
            <div className="mt-6">
              <CourseApplicationForm />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
