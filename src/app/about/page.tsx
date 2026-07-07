import type { Metadata } from "next";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { SectionHeading } from "@/components/marketing/section-heading";

export const metadata: Metadata = {
  title: "About",
  description:
    "Abelkirar is led by an Ethiopian Orthodox Church Deacon and Kirar musician, teaching the instrument to preserve and modernize Ethiopian spiritual music.",
};

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-24 text-[#f3e9d2] sm:py-32">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <p className="text-sm font-medium tracking-[0.25em] text-[#d4a84b] uppercase">
            About Abelkirar
          </p>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            A Deacon, a Kirar player, and a tradition worth carrying forward
          </h1>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container className="max-w-3xl space-y-6 text-lg text-muted-foreground text-pretty">
          <p>
            Abelkirar is led by an Ethiopian Orthodox Church Deacon and Kirar
            musician. {/* Add: how you started playing Kirar — age, family, home parish */}
          </p>
          <p>
            {/* Add: your path to serving as a Deacon, and how playing the Kirar
            became part of that calling */}
            Serving the church revealed a gap that shaped Abelkirar&rsquo;s
            mission: too many congregations, especially in the diaspora, lack
            musicians trained to play the Kirar well. Hymns that should lift a
            service often fall flat — not from a lack of devotion, but from a
            lack of structured teaching.
          </p>
          <p>
            Abelkirar was built to close that gap: rigorous, structured Kirar
            education, delivered online, for Ethiopian and Eritrean Orthodox
            communities wherever they&rsquo;ve settled — from parish halls in
            Addis Ababa to living rooms in the United States and United
            Kingdom.
          </p>
        </Container>
      </section>

      <section className="bg-muted/40 py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow="Why It Matters"
            title="Preservation is an active choice, not a memory"
            description="Ethiopian Orthodox spiritual music has survived centuries. It survives the next century only if it's taught deliberately — to the diaspora, to the next generation, and to anyone drawn to it."
            align="center"
            className="mx-auto"
          />
          <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-3">
            <div>
              <h3 className="font-heading text-xl font-semibold">Preserve</h3>
              <p className="mt-2 text-muted-foreground">
                Keep the traditional playing techniques, scales, and church
                repertoire intact and accurately taught.
              </p>
            </div>
            <div>
              <h3 className="font-heading text-xl font-semibold">Teach</h3>
              <p className="mt-2 text-muted-foreground">
                Structured, level-based online courses that take a student
                from silence to leading worship.
              </p>
            </div>
            <div>
              <h3 className="font-heading text-xl font-semibold">Modernize</h3>
              <p className="mt-2 text-muted-foreground">
                Bring the Kirar to a global, digitally-connected diaspora
                without losing what makes it sacred.
              </p>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
