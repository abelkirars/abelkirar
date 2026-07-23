import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/marketing/container";

export function CommunityCta() {
  const t = useTranslations("community");

  return (
    <section className="bg-muted py-20 sm:py-28">
      <Container className="flex flex-col items-center gap-6 text-center">
        <h2 className="max-w-2xl font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t("title")}
        </h2>
        <p className="max-w-xl text-lg text-muted-foreground text-pretty">
          {t("description")}
        </p>
        <Button size="lg" nativeButton={false} render={<Link href="/community" />}>
          {t("cta")}
        </Button>
      </Container>
    </section>
  );
}
