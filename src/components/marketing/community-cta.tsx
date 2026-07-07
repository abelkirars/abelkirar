import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/marketing/container";

export function CommunityCta() {
  return (
    <section className="bg-muted py-20 sm:py-28">
      <Container className="flex flex-col items-center gap-6 text-center">
        <h2 className="max-w-2xl font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          A community for Kirar players, wherever they live
        </h2>
        <p className="max-w-xl text-lg text-muted-foreground text-pretty">
          Monthly online gatherings, student performances, and workshops with
          guest Ethiopian musicians — built for a diaspora scattered across
          continents but united in worship.
        </p>
        <Button size="lg" nativeButton={false} render={<Link href="/community" />}>
          Explore the community
        </Button>
      </Container>
    </section>
  );
}
