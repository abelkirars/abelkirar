import { z } from "zod";
import { locales } from "@/i18n/locale";

export const STUDENT_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const STUDENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const studentSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.email(),
  phone: z.string().max(30).optional().or(z.literal("")),
  level: z.enum(STUDENT_LEVELS).optional().or(z.literal("")),
  enrollmentDate: z.iso.date(),
  status: z.enum(STUDENT_STATUSES),
  notes: z.string().max(4000).optional().or(z.literal("")),
  locale: z.enum(locales),
});

export type StudentInput = z.infer<typeof studentSchema>;
