import { z } from "zod";

type Translator = (key: string) => string;

/**
 * .strict() rejects ANY unrecognized key, not just studentId/studentProfileId
 * — a request body that names its own identity in any shape gets a 400, not
 * a silent strip. The route never reads studentId from the body regardless;
 * this schema is what turns "the field is ignored" into "the request is
 * rejected," per the write-path requirement that a caller-supplied identity
 * field is a bug in the request, not something to quietly tolerate.
 */
export function createPracticeLogEntrySchema(t: Translator) {
  return z
    .object({
      practicedAt: z.iso.date(t("enterValidPracticeDate")),
      durationMinutes: z
        .number(t("enterValidDuration"))
        .int(t("enterValidDuration"))
        .min(1, t("enterValidDuration"))
        .max(600, t("enterValidDuration")),
      focus: z.string().min(1, t("enterFocus")).max(500),
      selfRating: z.string().max(100).optional().or(z.literal("")),
    })
    .strict();
}

export type PracticeLogEntryInput = z.infer<ReturnType<typeof createPracticeLogEntrySchema>>;
