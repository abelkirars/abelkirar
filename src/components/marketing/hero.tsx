"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";

export function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] text-[#f3e9d2]">
      <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />

      <Container className="relative flex min-h-[82vh] flex-col justify-center gap-8 py-28">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-sm font-medium tracking-[0.25em] text-[#d4a84b] uppercase"
        >
          {t("eyebrow")}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="max-w-3xl font-heading text-5xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl"
        >
          {t("title")}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="max-w-xl text-lg text-[#f3e9d2]/80 text-pretty"
        >
          {t("description")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex flex-wrap items-center gap-4 pt-2"
        >
          <Button size="lg" nativeButton={false} render={<Link href="/courses" />}>
            {t("startLearning")}
          </Button>
          <Button
            size="lg"
            nativeButton={false}
            className="border-[#f3e9d2]/25 bg-transparent text-[#f3e9d2] hover:bg-[#f3e9d2]/10"
            render={<Link href="/store" />}
          >
            {t("buyInstruments")}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            nativeButton={false}
            className="text-[#f3e9d2] hover:bg-[#f3e9d2]/10 hover:text-[#f3e9d2]"
            render={<Link href="/community" />}
          >
            {t("joinCommunity")}
          </Button>
        </motion.div>
      </Container>
    </section>
  );
}
