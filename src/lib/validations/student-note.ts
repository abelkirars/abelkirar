import { z } from "zod";
import { strictBoolean } from "@/lib/validations/boolean";

// Admin-only form — English-only, plain-message pattern, matching
// weekly-practice.ts. Default true: an admin adding a note without
// touching the visibility toggle gets the more common case (visible),
// never a silently-private note.
export const studentNoteSchema = z.object({
  body: z.string().min(1).max(4000),
  visibleToStudent: strictBoolean(true),
});

export type StudentNoteInput = z.infer<typeof studentNoteSchema>;
