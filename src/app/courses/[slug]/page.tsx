import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { COURSE_LEVELS } from "@/lib/courses-data";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { Badge } from "@/components/ui/badge";
import { ContactForm } from "@/components/forms/contact-form";

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

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-24 text-[#f3e9d2] sm:py-32">
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
          <p className="mt-6 font-heading text-2xl text-[#d4a84b]">
            ${(course.price / 100).toFixed(0)}
          </p>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-heading text-2xl font-semibold">
              What you&rsquo;ll learn
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

          <div className="h-fit max-w-md rounded-2xl bg-card p-8 ring-1 ring-foreground/10">
            <h2 className="font-heading text-xl font-semibold">
              Join the {course.title} waitlist
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Be first to know when this course opens for enrollment.
            </p>
            <div className="mt-6">
              <ContactForm
                topic={`Course Waitlist — ${course.title}`}
                showMessageField={false}
                submitLabel="Join the waitlist"
                successMessage="You're on the list — we'll email you as soon as enrollment opens."
              />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
