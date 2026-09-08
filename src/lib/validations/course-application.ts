import { z } from "zod";

type Translator = (key: string) => string;

/**
 * The four choices the LEVEL question offers on the wire.
 *
 * This is deliberately NOT Prisma's StudentLevel. The question is mandatory —
 * every applicant must answer it — but "UNSURE" is a real answer, and it is
 * not a member of StudentLevel (which drives curriculum, milestones and
 * LevelReadiness, none of which have an "unsure" track). The server maps
 * UNSURE to null and the other three to the matching StudentLevel.
 *
 * The reason the question is required rather than optional: with an optional
 * field, "chose Not sure yet" and "answered nothing at all" arrive at the
 * server identically, so the requirement could not be enforced and a null
 * column could not be interpreted. Making UNSURE explicit on the wire is what
 * lets a null requestedLevel mean "the applicant said they were not sure"
 * rather than "we do not know whether they answered".
 */
export const REQUESTED_LEVEL_CHOICES = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "UNSURE",
] as const;

export const LESSON_LANGUAGES = ["AM", "EN", "EITHER"] as const;
export const KIRAR_MODELS = ["FIVE_STRING", "SIX_STRING", "NONE_YET", "UNSURE"] as const;
export const GUARDIAN_RELATIONSHIPS = ["Parent", "Guardian"] as const;

/**
 * Server-authoritative shape for a public course application submission.
 *
 * `email` is trimmed before format validation (so leading/trailing whitespace
 * never fails an otherwise-valid address) via z.string().trim().pipe(z.email())
 * — verified against this project's installed zod@4.4.3 type definitions:
 * trim() and pipe() are both declared on the universal base schema
 * (node_modules/zod/v4/classic/schemas.d.ts), so this composes cleanly with no
 * input/output type divergence. Lower-casing happens at the DB-write layer
 * (src/lib/course-applications.ts), not here — this schema's job is shape and
 * format only.
 *
 * `status`, `locale` and `guardianConsentAt` are deliberately not fields here.
 * status is always hardcoded PENDING server-side; locale is server-derived via
 * getLocale() (next-intl/server); and guardianConsentAt is generated on the
 * server at the moment of a consenting submission. A consent timestamp the
 * applicant can set is not a record of when consent was given, so it is never
 * read from client input — the client sends only the boolean `guardianConsent`.
 *
 * Deliberately no z.preprocess anywhere in this schema — it would make the
 * schema's input type diverge from its output type, which is the source of
 * zodResolver typing friction. Empty/whitespace-only optional fields are
 * normalized to undefined by the plain-object helper below instead, applied to
 * the raw body BEFORE this schema ever sees it (server: before safeParse;
 * client: before the resolver validates) — one helper, one source of truth,
 * kept out of the schema itself.
 *
 * There is no `experience` field: "tell us about your playing so far" maps onto
 * the existing applicantMessage. And there are no emergency-contact fields —
 * lessons are online and one-to-one, guardianPhone covers under-15s, and for
 * adults it is friction on the highest-drop-off screen. Do not add either back.
 */
export function createCourseApplicationSchema(t: Translator) {
  return z
    .object({
      fullName: z.string().trim().min(1, t("enterFullName")).max(200, t("fullNameTooLong")),
      country: z.string().trim().min(1, t("enterCountry")).max(100, t("countryTooLong")),
      /// Three-state nowhere on the wire: the form makes this a required
      /// choice, so the server always receives a real boolean.
      isUnder15: z.boolean(t("selectAgeGroup")),
      email: z.string().trim().max(254, t("emailTooLong")).pipe(z.email(t("enterValidEmail"))),
      /// The applicant's own number, and only collected when they are 15 or
      /// over — the form hides this field for under-15s so a parent is never
      /// asked for the same number twice under two different labels.
      phone: z.string().trim().max(40, t("phoneTooLong")).optional(),
      lessonLanguage: z.enum(LESSON_LANGUAGES, t("selectLessonLanguage")),
      requestedLevel: z.enum(REQUESTED_LEVEL_CHOICES, t("selectLevel")),
      kirarModel: z.enum(KIRAR_MODELS, t("selectKirarModel")),
      applicantMessage: z.string().trim().max(1000, t("applicantMessageTooLong")).optional(),

      /// Optional at the field level and made mandatory by the refinement
      /// below when isUnder15 is true. They cannot be declared required here
      /// because they must stay absent for applicants 15 and over.
      guardianName: z.string().trim().max(120, t("guardianNameTooLong")).optional(),
      guardianRelationship: z.enum(GUARDIAN_RELATIONSHIPS).optional(),
      guardianPhone: z.string().trim().max(40, t("guardianPhoneTooLong")).optional(),
      guardianConsent: z.boolean().optional(),
    })
    /**
     * THE CONDITIONAL RULE, ENFORCED HERE ON THE SERVER.
     *
     * The browser hides the guardian fieldset when the applicant is 15 or
     * over, but a hidden fieldset proves nothing — anyone can POST whatever
     * they like to the endpoint. This refinement is the only thing that
     * actually makes the guardian block mandatory, and it runs identically on
     * both sides of the wire because the client resolver uses this same schema.
     *
     * Each issue is attached to its own field path so the form can render the
     * message against the input it belongs to rather than as a form-level
     * error the applicant has to hunt through.
     *
     * The inverse case is deliberately NOT an error: an application from
     * someone 15 or over that happens to carry guardian keys is accepted and
     * the write layer stores null for all four. Rejecting it would turn a
     * harmless stale field into a failed submission for a real applicant.
     */
    .superRefine((value, ctx) => {
      if (value.isUnder15 !== true) return;

      if (!value.guardianName) {
        ctx.addIssue({
          code: "custom",
          message: t("enterGuardianName"),
          path: ["guardianName"],
        });
      }
      if (!value.guardianRelationship) {
        ctx.addIssue({
          code: "custom",
          message: t("selectGuardianRelationship"),
          path: ["guardianRelationship"],
        });
      }
      if (!value.guardianPhone) {
        ctx.addIssue({
          code: "custom",
          message: t("enterGuardianPhone"),
          path: ["guardianPhone"],
        });
      }
      if (value.guardianConsent !== true) {
        ctx.addIssue({
          code: "custom",
          message: t("guardianConsentRequired"),
          path: ["guardianConsent"],
        });
      }
    });
}

export type CreateCourseApplicationInput = z.infer<ReturnType<typeof createCourseApplicationSchema>>;

/**
 * The level values that ARE Prisma StudentLevel members — every wire choice
 * except UNSURE, derived from the list above so the two cannot drift apart.
 */
export type StudentLevelChoice = Exclude<
  (typeof REQUESTED_LEVEL_CHOICES)[number],
  "UNSURE"
>;

/**
 * Maps the wire level onto the column. UNSURE becomes null — the single place
 * that translation happens, so no call site has to remember it and nothing can
 * quietly coerce an unsure applicant into BEGINNER.
 */
export function toRequestedLevel(
  choice: CreateCourseApplicationInput["requestedLevel"]
): StudentLevelChoice | null {
  return choice === "UNSURE" ? null : choice;
}

const OPTIONAL_FIELDS = [
  "phone",
  "applicantMessage",
  "guardianName",
  "guardianRelationship",
  "guardianPhone",
] as const;

/**
 * Maps empty and whitespace-only strings to undefined for the optional text
 * fields — an untouched input, or a select still sitting on its empty
 * placeholder option. Applied on both sides of the wire: the route handler
 * runs this on the parsed JSON body before safeParse, and the client form's
 * resolver runs it on the raw form values before zod validates them (see
 * course-application-form.tsx) — so an empty value is treated identically
 * wherever it is checked, without the shared schema needing to know about the
 * transform at all.
 *
 * requestedLevel, lessonLanguage and kirarModel are NOT in this list, and that
 * is the point: they are required questions, so an empty selection must reach
 * z.enum and fail with "please choose one" rather than being quietly turned
 * into undefined and reported as a missing field.
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
