import { z } from "zod";

type Translator = (key: string) => string;

/**
 * Server-authoritative shape for a public course application submission.
 * `email` is trimmed before format validation (so leading/trailing
 * whitespace never fails an otherwise-valid address) via
 * z.string().trim().pipe(z.email(...)) — verified against this project's
 * installed zod@4.4.3 type definitions: trim() and pipe() are both declared
 * on the universal base schema (node_modules/zod/v4/classic/schemas.d.ts),
 * so this composes cleanly with no input/output type divergence. Lower-
 * casing happens at the DB-write layer (src/lib/course-applications.ts),
 * not here — this schema's job is shape and format only.
 *
 * `status` and `locale` are deliberately not fields here: status is always
 * hardcoded PENDING server-side, and locale is server-derived via
 * getLocale() (next-intl/server). Neither is ever read from client input.
 *
 * Deliberately no z.preprocess anywhere in this schema — it would make the
 * schema's input type diverge from its output type, which is the source of
 * zodResolver typing friction. Empty/whitespace-only optional fields are
 * normalized to undefined by the plain-object helper below instead, applied
 * to the raw body BEFORE this schema ever sees it (server: before
 * safeParse; client: before the resolver validates) — one helper, one
 * source of truth, kept out of the schema itself.
 */
export function createCourseApplicationSchema(t: Translator) {
  return z.object({
    fullName: z.string().trim().min(1, t("enterFullName")).max(200, t("fullNameTooLong")),
    email: z.string().trim().pipe(z.email(t("enterValidEmail"))),
    phone: z.string().trim().max(30, t("phoneTooLong")).optional(),
    requestedLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
    applicantMessage: z.string().trim().max(2000, t("applicantMessageTooLong")).optional(),
  });
}

export type CreateCourseApplicationInput = z.infer<ReturnType<typeof createCourseApplicationSchema>>;

const OPTIONAL_FIELDS = ["phone", "requestedLevel", "applicantMessage"] as const;

/**
 * Maps empty and whitespace-only strings to undefined for phone,
 * requestedLevel and applicantMessage — used for both the "Not sure yet"
 * select option (value "") and an untouched optional text field. Applied
 * on both sides of the wire: the route handler runs this on the parsed
 * JSON body before safeParse, and the client form's resolver runs it on
 * the raw form values before zod validates them (see
 * course-application-form.tsx) — so an empty selection is treated
 * identically wherever it's checked, without the shared schema needing to
 * know about the transform at all.
 */
export function normalizeOptionalFields<T extends Record<string, unknown>>(input: T): T {
  const normalized: Record<string, unknown> = { ...input };
  for (const key of OPTIONAL_FIELDS) {
    const value = normalized[key];
    if (typeof value === "string" && value.trim() === "") {
      normalized[key] = undefined;
    }
  }
  return normalized as T;
}
