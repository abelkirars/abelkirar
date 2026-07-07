import type { Metadata } from "next";
import { Container } from "@/components/marketing/container";
import { SectionHeading } from "@/components/marketing/section-heading";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { CourseLevelCards } from "@/components/marketing/course-level-cards";
import { ContactForm } from "@/components/forms/contact-form";

export const metadata: Metadata = {
  title: "Courses",
  description:
    "Structured Kirar courses from Beginner to Advanced, built for the Ethiopian and Eritrean Orthodox diaspora.",
};

export default function CoursesPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-24 text-[#f3e9d2] sm:py-32">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <p className="text-sm font-medium tracking-[0.25em] text-[#d4a84b] uppercase">
            Online Kirar Courses
          </p>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            From your first scale to leading worship
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[#f3e9d2]/80 text-pretty">
            Three structured levels, built for kids and adults, Ethiopian and
            Eritrean diaspora, and anyone drawn to the Kirar.
          </p>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container>
          <CourseLevelCards />
        </Container>
      </section>

      <section className="bg-muted/40 py-20 sm:py-28">
        <Container className="grid gap-12 lg:grid-cols-2">
          <SectionHeading
            eyebrow="Enrollment"
            title="Courses are opening soon"
            description="We're finishing production on the first cohort of video lessons. Join the waitlist and you'll be the first to know when registration opens — with early access pricing."
          />
          <div className="max-w-md rounded-2xl bg-card p-8 ring-1 ring-foreground/10">
            <ContactForm
              topic="Course Waitlist"
              showMessageField={false}
              submitLabel="Join the waitlist"
              successMessage="You're on the list — we'll email you as soon as enrollment opens."
            />
          </div>
        </Container>
      </section>
    </>
  );
}
