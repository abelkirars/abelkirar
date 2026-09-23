import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { getPublicCoursePlans } from "@/lib/courses/public-plans";
import { CoursePlanSelector } from "./course-plan-selector";
import { COURSE_LEVELS } from "@/lib/courses-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function CourseLevelCards() {
  await connection();
  const [t, plans] = await Promise.all([getTranslations("courseLevels"), getPublicCoursePlans()]);

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {COURSE_LEVELS.map((course) => (
        <article key={course.slug} className="group">
          <Card className="h-full transition-shadow group-hover:shadow-lg">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                {t(`${course.slug}.level`)}
              </Badge>
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
      ))}
    </div>
  );
}
