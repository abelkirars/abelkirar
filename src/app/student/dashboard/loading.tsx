import { Container } from "@/components/marketing/container";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

// Wordless, dataless structural placeholder for /student/dashboard's
// Suspense fallback. Mirrors that page's exact card hierarchy (title row,
// then the six stacked Cards in the same order) so the swap-in reads as a
// continuation rather than a layout jump, without knowing or guessing at
// any of that page's real data. No visible or translated text anywhere —
// see page.tsx for the strings this stands in for. No animation: nothing
// here moves, so there is nothing for prefers-reduced-motion to disable.
// Plain Server Component (no "use client") — Next.js automatically wraps
// page.tsx's awaited queries in a Suspense boundary using this file; see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md.
function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-md bg-muted ${className ?? ""}`} />;
}

export default function StudentDashboardLoading() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <SkeletonBlock className="h-9 w-56" />
            <SkeletonBlock className="h-5 w-72" />
          </div>
          <SkeletonBlock className="h-9 w-20 shrink-0" />
        </div>

        <div className="mt-8 space-y-6">
          {/* Current level + current focus */}
          <Card>
            <CardContent className="flex flex-col gap-6 sm:flex-row sm:divide-x sm:divide-border/60">
              <div className="space-y-2 sm:w-1/3 sm:pr-6">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-6 w-20" />
              </div>
              <div className="space-y-2 sm:w-2/3 sm:pl-6">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-4 w-48" />
              </div>
            </CardContent>
          </Card>

          {/* Continue practice */}
          <Card>
            <CardHeader>
              <SkeletonBlock className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <SkeletonBlock className="h-11 w-48" />
            </CardContent>
          </Card>

          {/* This week's assignment */}
          <Card>
            <CardHeader>
              <SkeletonBlock className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <SkeletonBlock className="h-5 w-2/3" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-5/6" />
            </CardContent>
          </Card>

          {/* Notes from your teacher */}
          <Card>
            <CardHeader>
              <SkeletonBlock className="h-6 w-52" />
            </CardHeader>
            <CardContent>
              <SkeletonBlock className="h-16 w-full" />
            </CardContent>
          </Card>

          {/* Achieved milestones */}
          <Card>
            <CardHeader>
              <SkeletonBlock className="h-6 w-44" />
            </CardHeader>
            <CardContent>
              <SkeletonBlock className="h-12 w-full" />
            </CardContent>
          </Card>

          {/* Practice log */}
          <Card>
            <CardHeader>
              <SkeletonBlock className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <SkeletonBlock className="h-24 w-full" />
              <SkeletonBlock className="h-16 w-full" />
            </CardContent>
          </Card>
        </div>
      </Container>
    </section>
  );
}
