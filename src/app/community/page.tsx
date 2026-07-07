import type { Metadata } from "next";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NewsletterForm } from "@/components/forms/newsletter-form";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Monthly online gatherings, student performances, and workshops with guest Ethiopian musicians for the Abelkirar diaspora community.",
};

const OFFERINGS = [
  {
    title: "Monthly online gatherings",
    description:
      "A recurring video gathering for students and Kirar players across time zones — practice together, ask questions, and hear from other musicians.",
  },
  {
    title: "Student performances",
    description:
      "A space for students to share what they're learning, from a first scale to a full hymn, and get encouragement from the community.",
  },
  {
    title: "Workshops with guest musicians",
    description:
      "Occasional workshops with experienced Ethiopian musicians, focused on repertoire, style, and church performance practice.",
  },
];

export default function CommunityPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-24 text-[#f3e9d2] sm:py-32">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <p className="text-sm font-medium tracking-[0.25em] text-[#d4a84b] uppercase">
            Community
          </p>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            A gathering place for Kirar players, wherever they live
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[#f3e9d2]/80 text-pretty">
            Abelkirar is starting its first community cohort — join now and
            help shape it from the beginning.
          </p>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow="What to expect"
            title="Built for a diaspora scattered across continents"
            align="center"
            className="mx-auto"
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {OFFERINGS.map((offering) => (
              <Card key={offering.title}>
                <CardHeader>
                  <h3 className="font-heading text-xl font-semibold">
                    {offering.title}
                  </h3>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{offering.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-muted/40 py-20 sm:py-28">
        <Container className="max-w-xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Be one of our founding members
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            We&rsquo;re building this community with our first students and
            musicians. Join the list and we&rsquo;ll invite you to the first
            gathering.
          </p>
          <NewsletterForm
            source="community"
            className="mx-auto mt-8 flex max-w-sm flex-col gap-2"
          />
        </Container>
      </section>
    </>
  );
}
