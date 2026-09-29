import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { cn } from "@/lib/utils";
import { getPublicCoursePlans } from "@/lib/courses/public-plans";
import { CoursePlanSelector } from "./course-plan-selector";
import { COURSE_LEVELS } from "@/lib/courses-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RevealOnView } from "@/components/motion/reveal-on-view";
import motionStyles from "@/components/motion/motion.module.css";
import styles from "./course-level-cards.module.css";

/**
 * The three course levels with their real plans. `motion` (homepage only)
 * adds a staggered entrance, a level glyph and hover/focus/selection
 * styling; the plans, prices, promotions and links are identical either way.
 */
export async function CourseLevelCards({ motion = false }: { motion?: boolean } = {}) {
  await connection();
  const [t, plans] = await Promise.all([getTranslations("courseLevels"), getPublicCoursePlans()]);

  const cards = COURSE_LEVELS.map((course, index) => (
    <article
      key={course.slug}
      className={cn("group", motion && styles.article, motion && motionStyles.revealItem)}
      style={motion ? ({ "--d": `${index * 120}ms` } as CSSProperties) : undefined}
    >
      <Card className={cn("h-full transition-shadow group-hover:shadow-lg", motion && styles.card)}>
        <CardHeader>
          {motion ? (
            <div className="flex items-center justify-between gap-3">
              <Badge variant="secondary" className="w-fit">
                {t(`${course.slug}.level`)}
              </Badge>
              <span aria-hidden="true" className={styles.glyph}>
                {[0, 1, 2].map((line) => (
                  <span key={line} data-lit={line <= index ? "" : undefined} />
                ))}
              </span>
            </div>
          ) : (
            <Badge variant="secondary" className="w-fit">
              {t(`${course.slug}.level`)}
            </Badge>
          )}
          <h3 className="mt-3 font-heading text-2xl font-semibold">
            {t(`${course.slug}.title`)}
          </h3>
          <p className="text-sm font-medium text-accent">{t(`${course.slug}.tagline`)}</p>
        </CardHeader>
        <CardContent className="flex h-full flex-col justify-between gap-6">
          <p className="text-muted-foreground">{t(`${course.slug}.description`)}</p>
          <CoursePlanSelector plans={plans.filter(plan => plan.level === course.studentLevel)} slug={course.slug} />
          <Link href={`/courses/${course.slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
            {t("exploreCurriculum")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </CardContent>
      </Card>
    </article>
  ));

  if (!motion) return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>;

  return (
    <RevealOnView amount={0.15} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div data-plan-motion="" className="contents">
        {cards}
      </div>
    </RevealOnView>
  );
}
