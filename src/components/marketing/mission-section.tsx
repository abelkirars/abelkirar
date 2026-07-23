import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";

export async function MissionSection() {
  const t = await getTranslations("mission");

  return (
    <section className="py-20 sm:py-28">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-sm font-medium tracking-[0.2em] text-accent uppercase">
            {t("eyebrow")}
          </p>
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t("title")}
          </h2>
          <div className="mt-6 space-y-4 text-lg text-muted-foreground text-pretty">
            <p>{t("paragraph1")}</p>
            <p>{t("paragraph2")}</p>
          </div>
          <Link
            href="/about"
            className="mt-6 inline-block font-medium text-accent underline underline-offset-4"
          >
            {t("readOurStory")}
          </Link>
        </div>

        <div className="relative aspect-4/5 overflow-hidden rounded-2xl bg-gradient-to-br from-secondary to-[#16362c] text-secondary-foreground">
          <CrossPattern className="text-[#f3e9d2] opacity-[0.12]" />
          <div className="relative flex h-full flex-col justify-end p-8">
            <p className="font-heading text-2xl text-balance">{t("quote")}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
