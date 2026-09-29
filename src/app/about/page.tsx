import { Suspense } from "react";
import { PublishedMedia } from "@/components/marketing/site-media";
import type { Metadata } from "next";
import { AboutJourney, AboutStory, AboutTitleSequence } from "@/components/marketing/about-sections";

export const metadata: Metadata = {
  title: "About",
  description:
    "Meet Deacon Abel (Abelkirar), a Kirar player who teaches online lessons for accompanying Ethiopian Orthodox chanting.",
};

export default function AboutPage() {
  return (
    <>
      <AboutTitleSequence />
      <Suspense fallback={null}><PublishedMedia slot="teacher-photo" /></Suspense>
      <AboutStory />
      <AboutJourney />
    </>
  );
}
