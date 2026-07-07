import Link from "next/link";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";

export function MissionSection() {
  return (
    <section className="py-20 sm:py-28">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-sm font-medium tracking-[0.2em] text-accent uppercase">
            Our Mission
          </p>
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Preserving Ethiopian spiritual music, one musician at a time
          </h2>
          <div className="mt-6 space-y-4 text-lg text-muted-foreground text-pretty">
            <p>
              Abelkirar exists to train Kirar players wherever the Ethiopian
              and Eritrean Orthodox diaspora has gathered — so that worship
              in churches across the United States, the United Kingdom, and
              Europe is carried by musicians who play with real skill and
              understanding.
            </p>
            <p>
              Abelkirar is led by a Kirar musician and Ethiopian Orthodox
              Church Deacon, teaching the instrument the way it has always
              been taught — by ear, by tradition, and in service of the
              liturgy — combined with structured, modern online lessons.
            </p>
          </div>
          <Link
            href="/about"
            className="mt-6 inline-block font-medium text-accent underline underline-offset-4"
          >
            Read our story
          </Link>
        </div>

        <div className="relative aspect-4/5 overflow-hidden rounded-2xl bg-gradient-to-br from-secondary to-[#16362c] text-secondary-foreground">
          <CrossPattern className="text-[#f3e9d2] opacity-[0.12]" />
          <div className="relative flex h-full flex-col justify-end p-8">
            <p className="font-heading text-2xl text-balance">
              &ldquo;Music that carries the liturgy shouldn&rsquo;t be left to
              chance.&rdquo;
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
