import { z } from "zod";

type Translator = (key: string) => string;

// .strict() rejects any unrecognized key (e.g. a caller-supplied
// studentId/studentProfileId), same reasoning as every other student
// write-path schema — the route never reads identity from the body
// regardless, so this turns "the field is ignored" into "the request is
// rejected."
export function createRecordingUploadRequestSchema(t: Translator) {
  return z
    .object({
      weeklyPracticeId: z.string().min(1, t("selectAssignment")),
      mimeType: z.string().min(1, t("invalidRecordingType")),
      fileSize: z.number(t("invalidRecordingSize")).int().positive(t("invalidRecordingSize")),
    })
    .strict();
}

export function createRecordingConfirmSchema(t: Translator) {
  return z
    .object({
      weeklyPracticeId: z.string().min(1, t("selectAssignment")),
      path: z.string().min(1, t("invalidRecordingPath")),
      fileName: z.string().min(1).max(255),
      mimeType: z.string().min(1, t("invalidRecordingType")),
      fileSize: z.number(t("invalidRecordingSize")).int().positive(t("invalidRecordingSize")),
    })
    .strict();
}

export type RecordingUploadRequestInput = z.infer<
  ReturnType<typeof createRecordingUploadRequestSchema>
>;
export type RecordingConfirmInput = z.infer<ReturnType<typeof createRecordingConfirmSchema>>;
