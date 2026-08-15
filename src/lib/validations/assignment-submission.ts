import { z } from "zod";

type Translator = (key: string) => string;

// .strict() rejects any unrecognized key outright (e.g. a caller-supplied
// studentId/studentProfileId), same reasoning as
// createPracticeLogEntrySchema — the route never reads identity from the
// body regardless, so this turns "the field is ignored" into "the request
// is rejected."
export function createAssignmentSubmissionSchema(t: Translator) {
  return z
    .object({
      studentSubmission: z.string().min(1, t("enterSubmission")).max(4000),
    })
    .strict();
}

export type AssignmentSubmissionInput = z.infer<
  ReturnType<typeof createAssignmentSubmissionSchema>
>;
