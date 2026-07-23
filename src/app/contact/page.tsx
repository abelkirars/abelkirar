import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { ContactForm } from "@/components/forms/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Abelkirar about courses, custom instruments, or anything else.",
};

export default async function ContactPage() {
  const t = await getTranslations("contact");

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-24 text-[#f3e9d2] sm:py-32">
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

      <section className="py-20 sm:py-28">
        <Container className="max-w-xl">
          <div className="rounded-2xl bg-card p-8 ring-1 ring-foreground/10">
            <ContactForm topic="General" />
          </div>
        </Container>
      </section>
    </>
  );
}
