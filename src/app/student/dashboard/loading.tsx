import { Container } from "@/components/marketing/container";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

// Wordless, dataless Server Component. It mirrors the premium dashboard's
// hero and two-column content hierarchy without guessing any student data.
function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-lg bg-muted ${className ?? ""}`} />;
}

const SKELETON_CARD_CLASS =
  "gap-0 rounded-3xl bg-card/95 py-0 shadow-[0_18px_55px_-38px_rgba(42,32,24,0.55)] ring-secondary/10";

export default function StudentDashboardLoading() {
  return (
    <section className="relative isolate overflow-hidden py-10 sm:py-14 lg:py-16">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-gradient-to-b from-secondary/10 via-primary/5 to-transparent"
      />

      <Container className="max-w-7xl">
        <div className="overflow-hidden rounded-[2rem] bg-secondary p-6 shadow-[0_28px_90px_-42px_rgba(31,75,63,0.9)] ring-1 ring-secondary/40 sm:p-8 lg:p-10">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-4">
              <SkeletonBlock className="h-4 w-40 bg-secondary-foreground/20!" />
              <SkeletonBlock className="h-11 w-64 max-w-full bg-secondary-foreground/20! sm:w-96" />
            </div>
            <SkeletonBlock className="h-10 w-20 shrink-0 bg-secondary-foreground/20!" />
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-[0.72fr_1.55fr_auto]">
            <div className="space-y-3 rounded-2xl border border-secondary-foreground/15 p-4">
              <SkeletonBlock className="h-4 w-24 bg-secondary-foreground/20!" />
              <SkeletonBlock className="h-5 w-20 bg-secondary-foreground/20!" />
            </div>
            <div className="space-y-3 rounded-2xl border border-secondary-foreground/15 p-4">
              <SkeletonBlock className="h-4 w-28 bg-secondary-foreground/20!" />
              <SkeletonBlock className="h-6 w-48 bg-secondary-foreground/20!" />
              <SkeletonBlock className="h-4 w-full bg-secondary-foreground/20!" />
            </div>
            <div className="space-y-3 rounded-2xl border border-primary/30 p-4 md:col-span-2 lg:col-span-1 lg:min-w-56">
              <SkeletonBlock className="h-4 w-32 bg-secondary-foreground/20!" />
              <SkeletonBlock className="h-11 w-full bg-primary/35!" />
            </div>
          </div>
        </div>

        <Card className={`${SKELETON_CARD_CLASS} mt-6 lg:mt-8`}>
          <CardHeader className="border-b border-border/70 bg-muted/25 p-6">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="size-10" />
              <SkeletonBlock className="h-6 w-36" />
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <SkeletonBlock className="h-32 w-full rounded-2xl" />
              <SkeletonBlock className="h-32 w-full rounded-2xl" />
              <SkeletonBlock className="h-32 w-full rounded-2xl" />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 grid items-start gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.72fr)]">
          <div className="space-y-6">
            <Card className={SKELETON_CARD_CLASS}>
              <CardHeader className="border-b border-border/70 bg-muted/25 p-6">
                <div className="flex items-center gap-3">
                  <SkeletonBlock className="size-10" />
                  <div className="space-y-2">
                    <SkeletonBlock className="h-6 w-48" />
                    <SkeletonBlock className="h-3 w-32" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <SkeletonBlock className="h-6 w-2/3" />
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-5/6" />
                <SkeletonBlock className="h-20 w-full rounded-2xl" />
              </CardContent>
            </Card>

            <Card className={SKELETON_CARD_CLASS}>
              <CardHeader className="border-b border-border/70 bg-muted/25 p-6">
                <div className="flex items-center gap-3">
                  <SkeletonBlock className="size-10" />
                  <SkeletonBlock className="h-6 w-36" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <SkeletonBlock className="h-64 w-full rounded-2xl" />
                <SkeletonBlock className="h-20 w-full rounded-2xl" />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className={SKELETON_CARD_CLASS}>
              <CardHeader className="border-b border-border/70 bg-muted/25 p-5">
                <SkeletonBlock className="h-6 w-48" />
              </CardHeader>
              <CardContent className="p-5">
                <SkeletonBlock className="h-20 w-full rounded-2xl" />
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
}
