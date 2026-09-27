import "server-only";
import { getTranslations } from "next-intl/server";
import { COURSE_LEVELS } from "@/lib/courses-data";
import { INSTRUMENT_CATEGORIES } from "@/lib/instrument-categories";
import { NAV_LINKS } from "@/lib/nav";
import type { CourseSlug, LabCopy } from "./copy";
import type { InstrumentCopy } from "./instrument-section";

/** Reads the live site's own copy (current locale), read-only. */
export async function loadLabCopy(): Promise<{ copy: LabCopy; instruments: InstrumentCopy[] }> {
  const [hero, home, about, levels, plan, mission, nav, store, categories] = await Promise.all([
    getTranslations("hero"),
    getTranslations("home"),
    getTranslations("about"),
    getTranslations("courseLevels"),
    getTranslations("coursePlanChoice"),
    getTranslations("mission"),
    getTranslations("nav"),
    getTranslations("store"),
    getTranslations("instrumentCategories"),
  ]);

  const copy: LabCopy = {
    hero: {
      eyebrow: hero("eyebrow"),
      title: hero("title"),
      description: hero("description"),
      startLearning: hero("startLearning"),
      contactAbel: hero("contactAbel"),
    },
    home: {
      coursesEyebrow: home("coursesEyebrow"),
      coursesTitle: home("coursesTitle"),
      coursesDescription: home("coursesDescription"),
      instrumentsEyebrow: home("instrumentsEyebrow"),
      instrumentsTitle: home("instrumentsTitle"),
      instrumentsDescription: home("instrumentsDescription"),
    },
    purpose: {
      eyebrow: about("whyEyebrow"),
      title: about("whyTitle"),
      description: about("whyDescription"),
      pillars: (["learn", "accompany", "serve"] as const).map((key) => ({
        title: about(key),
        description: about(`${key}Description`),
      })),
    },
    courses: COURSE_LEVELS.map((course) => {
      const slug = course.slug as CourseSlug;
      return {
        slug,
        level: levels(`${slug}.level`),
        title: levels(`${slug}.title`),
        tagline: levels(`${slug}.tagline`),
        description: levels(`${slug}.description`),
      };
    }),
    plan: {
      legend: plan("legend"),
      group: plan("group", { min: 3, max: 4 }),
      private: plan("private"),
      monthly: plan("monthly"),
      continue: plan("continue"),
    },
    missionQuote: mission("quote"),
    nav: NAV_LINKS.filter((link) => link.key !== "studentPortal").map((link) => ({ label: nav(link.key) })),
    store: { view: store("view"), production: store("production") },
  };

  const instruments: InstrumentCopy[] = INSTRUMENT_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    shop: categories("shopCategory", { category: category.name }),
  }));

  return { copy, instruments };
}
