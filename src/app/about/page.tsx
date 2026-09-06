import { Suspense } from "react";
import { PublishedMedia } from "@/components/marketing/site-media";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { SectionHeading } from "@/components/marketing/section-heading";

export const metadata: Metadata = {
  title: "About",
  description:
    "Meet Deacon Abel (Abelkirar), a Kirar player who teaches online lessons for accompanying Ethiopian Orthodox chanting.",
};

export default async function AboutPage() {
  const t = await getTranslations("about");

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
        </Container>
      </section>

      <Suspense fallback={null}><PublishedMedia slot="teacher-photo" /></Suspense>
      <section className="py-14 sm:py-24">
        <Container className="max-w-3xl space-y-6 text-lg text-muted-foreground text-pretty">
          <p>{t("paragraph1")}</p>
          <p>{t("paragraph2")}</p>
          <p>{t("paragraph3")}</p>
        </Container>
      </section>

      <section className="bg-muted/40 py-14 sm:py-24">
        <Container>
          <SectionHeading
            eyebrow={t("whyEyebrow")}
            title={t("whyTitle")}
            description={t("whyDescription")}
            align="center"
            className="mx-auto"
          />
          <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-3">
            <div>
              <h3 className="font-heading text-xl font-semibold">{t("learn")}</h3>
              <p className="mt-2 text-muted-foreground">{t("learnDescription")}</p>
            </div>
            <div>
              <h3 className="font-heading text-xl font-semibold">{t("accompany")}</h3>
              <p className="mt-2 text-muted-foreground">{t("accompanyDescription")}</p>
            </div>
            <div>
              <h3 className="font-heading text-xl font-semibold">{t("serve")}</h3>
              <p className="mt-2 text-muted-foreground">{t("serveDescription")}</p>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
