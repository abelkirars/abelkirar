import { Suspense } from "react";
import { PublishedMedia } from "@/components/marketing/site-media";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { SectionHeading } from "@/components/marketing/section-heading";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { CourseLevelCards } from "@/components/marketing/course-level-cards";
import { CourseApplicationForm } from "@/components/forms/course-application-form";

export const metadata: Metadata = {
  title: "Courses",
  description:
    "Structured Kirar courses from Beginner to Advanced, built for the Ethiopian and Eritrean Orthodox diaspora.",
};

export default async function CoursesPage() {
  const t = await getTranslations("courses");
  const tForm = await getTranslations("courseApplicationForm");

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-16 text-[#f3e9d2] sm:py-32">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <p className="text-sm font-medium tracking-[0.25em] text-[#d4a84b] uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[#f3e9d2]/80 text-pretty">
            {t("description")}
          </p>
        </Container>
      </section>

      <Suspense fallback={null}><PublishedMedia slot="teacher-photo" /></Suspense>
      <Suspense fallback={null}><PublishedMedia slot="course-sample" /></Suspense>
      <Suspense fallback={null}><PublishedMedia slot="kirar-audio" /></Suspense>
      <section className="py-14 sm:py-24">
        <Container>
          <CourseLevelCards />
          <p className="mx-auto mt-8 max-w-2xl text-center text-muted-foreground">{t("availability")}</p>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">{t("strings")}</p>
        </Container>
      </section>

      <section id="waitlist" className="scroll-mt-20 bg-muted/40 py-14 sm:py-24">
        <Container className="grid gap-12 lg:grid-cols-2">
          <SectionHeading
            eyebrow={tForm("eyebrow")}
            title={tForm("title")}
            description={tForm("description")}
          />
          <div className="max-w-md rounded-2xl bg-card p-8 ring-1 ring-foreground/10">
            <CourseApplicationForm />
          </div>
        </Container>
      </section>
    </>
  );
}
