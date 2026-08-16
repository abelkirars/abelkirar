import { z } from "zod";
import { strictBoolean } from "@/lib/validations/boolean";

// Admin-only form — English-only, plain-message pattern, matching
// weekly-practice.ts.
export const MILESTONE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

export const milestoneSchema = z.object({
  level: z.enum(MILESTONE_LEVELS),
  label: z.string().min(1).max(200),
  description: z.string().max(1000).optional().or(z.literal("")),
  // Never sent to a student client — see the SECURITY-style note on
  // Milestone.internalCriteria in prisma/schema.prisma.
  internalCriteria: z.string().max(2000).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int(),
  active: strictBoolean(true),
  // Optional: left blank, the database default (now()) applies. Admin-
  // settable separately so a milestone can be drafted before it's meant
  // to start counting toward any student's percentage — see
  // Milestone.effectiveFrom's schema comment.
  effectiveFrom: z.iso.date().optional().or(z.literal("")),
});

export type MilestoneInput = z.infer<typeof milestoneSchema>;
