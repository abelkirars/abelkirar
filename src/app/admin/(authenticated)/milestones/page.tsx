import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { MilestoneForm } from "@/components/admin/milestone-form";
import { MilestoneRow } from "@/components/admin/milestone-row";
import { MILESTONE_LEVELS } from "@/lib/validations/milestone";

export const dynamic = "force-dynamic";

const LEVEL_LABELS: Record<(typeof MILESTONE_LEVELS)[number], string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

export default async function AdminMilestonesPage() {
  // Admin side — no restrictive select needed, same reasoning as
  // students/[studentId]/page.tsx: internalCriteria is fine here, the
  // boundary is specifically about the student-facing query path.
  const milestones = await prisma.milestone.findMany({
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
  });

  return (
    <section className="py-10">
      <Container className="max-w-3xl">
        <h1 className="font-heading text-2xl font-semibold">Milestones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The catalog of milestones a student can be assigned, grouped by level. Creating
          or editing here never touches any student directly — assignment happens from a
          student&apos;s own page.
        </p>

        <div className="mt-6 rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium">Add milestone</h2>
          <MilestoneForm />
        </div>

        {MILESTONE_LEVELS.map((level) => {
          const levelMilestones = milestones.filter((m) => m.level === level);
          return (
            <div key={level} className="mt-8">
              <h2 className="font-medium">{LEVEL_LABELS[level]}</h2>
              <div className="mt-3 space-y-3">
                {levelMilestones.map((milestone) => (
                  <MilestoneRow key={milestone.id} milestone={milestone} />
                ))}
                {levelMilestones.length === 0 && (
                  <p className="py-4 text-center text-muted-foreground">
                    No milestones yet at this level.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </Container>
    </section>
  );
}
