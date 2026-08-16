import { z } from "zod";

// Admin-only forms — English-only, plain-message pattern.

export const assignMilestoneSchema = z.object({
  milestoneId: z.string().min(1),
});

// status/achievedAt/signedOffById are never form inputs — the approval
// route sets them itself. teacherComment is the only thing an admin
// supplies. "Teacher approval is required for milestone achievement...
// no automatic completion" (spec §7.G) — this schema backs the ONLY
// route that can ever set status: ACHIEVED.
export const approveMilestoneSchema = z.object({
  teacherComment: z.string().max(2000).optional().or(z.literal("")),
});

export type AssignMilestoneInput = z.infer<typeof assignMilestoneSchema>;
export type ApproveMilestoneInput = z.infer<typeof approveMilestoneSchema>;
