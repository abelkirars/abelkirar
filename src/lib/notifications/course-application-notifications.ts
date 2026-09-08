import { getTranslations } from "next-intl/server";
import { sendEmail, adminEmailRecipients, type SendEmailResult } from "@/lib/notifications/email";
import type { Locale } from "@/i18n/locale";

/**
 * The language the ADMIN notification is written in.
 *
 * Fixed rather than following the applicant's locale, so one inbox does not
 * alternate between two languages depending on who applied. English is the
 * default because the rest of the admin surface is English; change this one
 * constant to "am" if that is the wrong call. It does not affect the
 * applicant's own email, which always follows their locale.
 */
const ADMIN_NOTIFICATION_LOCALE: Locale = "en";

/**
 * A deliberately narrow view of a CourseApplication.
 *
 * It exists so that `adminNotes` — which prisma/schema.prisma requires never
 * to appear in any applicant- or student-facing payload or email — is
 * structurally absent from everything this module can reach, rather than
 * merely unused by it. Same for decisionReason, reviewedById and the rest of
 * the review-side columns. Passing the whole Prisma row here would make that a
 * convention; passing this makes it a type error.
 */
export interface CourseApplicationNotificationData {
  id: string;
  fullName: string;
  email: string;
  country: string | null;
  phone: string | null;
  lessonLanguage: "AM" | "EN" | "EITHER" | null;
  requestedLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  kirarModel: "FIVE_STRING" | "SIX_STRING" | "NONE_YET" | "UNSURE" | null;
  applicantMessage: string | null;
  isUnder15: boolean | null;
  guardianName: string | null;
  guardianRelationship: string | null;
  guardianPhone: string | null;
  locale: Locale;
}

/**
 * Applicant-supplied values are interpolated into HTML email bodies, so every
 * one of them is escaped first. A name or a free-text note containing markup
 * would otherwise render as markup in the reader's mail client.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Translator = (key: string) => string;

/** null renders as an explicit "not provided" rather than an empty row. */
function value(raw: string | null | undefined, t: Translator): string {
  const trimmed = raw?.trim();
  return trimmed ? escapeHtml(trimmed) : escapeHtml(t("valueNotProvided"));
}

function row(label: string, rendered: string): string {
  return `<p><strong>${escapeHtml(label)}:</strong> ${rendered}</p>`;
}

const LEVEL_KEYS = {
  BEGINNER: "levelBeginner",
  INTERMEDIATE: "levelIntermediate",
  ADVANCED: "levelAdvanced",
} as const;

const MODEL_KEYS = {
  FIVE_STRING: "modelFiveString",
  SIX_STRING: "modelSixString",
  NONE_YET: "modelNoneYet",
  UNSURE: "modelUnsure",
} as const;

const LANGUAGE_KEYS = {
  AM: "languageAmharic",
  EN: "languageEnglish",
  EITHER: "languageEither",
} as const;

/**
 * A null requestedLevel means the applicant chose "Not sure yet" — see
 * prisma/schema.prisma. It is rendered as that answer, never as a blank or as
 * a guessed level.
 */
function levelLabel(level: CourseApplicationNotificationData["requestedLevel"], tForm: Translator) {
  return escapeHtml(level === null ? tForm("levelNotSure") : tForm(LEVEL_KEYS[level]));
}

/**
 * Notifies the teacher that an application arrived.
 *
 * Includes applicantMessage, which is admin-visible by design. It must never
 * appear in the applicant-facing email below — schema.prisma states that
 * explicitly, and the two bodies are built separately here so one cannot leak
 * into the other by editing a shared template.
 */
export async function notifyAdminOfApplication(
  data: CourseApplicationNotificationData
): Promise<SendEmailResult> {
  const recipients = adminEmailRecipients();
  if (recipients.length === 0) {
    // Not an error the applicant should ever see, but it does mean nobody has
    // been told — which is the failure this whole module exists to prevent.
    console.warn("[course-applications] ADMIN_NOTIFICATION_EMAILS is not set; nobody was notified");
    return { sent: false, error: "No admin recipients configured" };
  }

  const locale = ADMIN_NOTIFICATION_LOCALE;
  const t = await getTranslations({ locale, namespace: "courseApplicationEmails" });
  const tForm = await getTranslations({ locale, namespace: "courseApplicationForm" });

  const byGuardian = data.isUnder15 === true;

  const html = [
    `<p>${escapeHtml(t("adminHeading"))}</p>`,
    row(t("labelName"), value(data.fullName, t)),
    row(t("labelEmail"), value(data.email, t)),
    row(t("labelCountry"), value(data.country, t)),
    row(t("labelPhone"), value(byGuardian ? data.guardianPhone : data.phone, t)),
    row(t("labelLevel"), levelLabel(data.requestedLevel, tForm)),
    row(
      t("labelKirarModel"),
      data.kirarModel ? escapeHtml(tForm(MODEL_KEYS[data.kirarModel])) : value(null, t)
    ),
    row(
      t("labelLessonLanguage"),
      data.lessonLanguage ? escapeHtml(tForm(LANGUAGE_KEYS[data.lessonLanguage])) : value(null, t)
    ),
    // Compared with === true, never truthiness: isUnder15 is three-state and
    // "unknown" must not read as "an adult applied".
    row(t("labelCompletedByGuardian"), escapeHtml(byGuardian ? t("guardianYes") : t("guardianNo"))),
    byGuardian ? row(t("labelGuardianName"), value(data.guardianName, t)) : "",
    byGuardian ? row(t("labelGuardianRelationship"), value(data.guardianRelationship, t)) : "",
    `<p><strong>${escapeHtml(t("labelExperience"))}:</strong><br/>${value(data.applicantMessage, t)}</p>`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendEmail({
    to: recipients,
    subject: `${t("adminSubject")} — ${data.fullName}`,
    html,
  });
}

/**
 * Confirms receipt to the applicant, or to the parent/guardian when the
 * student is under 15 — the single collected email address is the guardian's
 * in that case, which is why there is only ever one recipient here.
 *
 * Deliberately does NOT quote applicantMessage back. That field is
 * admin-visible only.
 */
export async function notifyApplicantOfApplication(
  data: CourseApplicationNotificationData
): Promise<SendEmailResult> {
  const t = await getTranslations({
    locale: data.locale,
    namespace: "courseApplicationEmails",
  });

  const addressee = data.isUnder15 === true && data.guardianName ? data.guardianName : data.fullName;

  const html = [
    `<p>${escapeHtml(t("applicantGreeting"))} ${escapeHtml(addressee)},</p>`,
    `<p>${escapeHtml(t("applicantReceived"))}</p>`,
    `<p>${escapeHtml(t("applicantNoPayment"))}</p>`,
    `<p>${escapeHtml(t("applicantWhenToExpect"))}</p>`,
    `<p>${escapeHtml(t("applicantSignoff"))}</p>`,
  ].join("\n");

  return sendEmail({
    to: data.email,
    subject: t("applicantSubject"),
    html,
  });
}

/**
 * Sends both emails and reports both outcomes.
 *
 * Never throws and never rejects: sendEmail resolves with a result rather than
 * throwing even on an API-level rejection, and Promise.all over two
 * non-rejecting promises cannot reject. The caller is therefore free to await
 * this after the application has already been saved without any risk of
 * turning a mail problem into a failed submission.
 *
 * The caller must only invoke this for a genuinely new application. A
 * duplicate submission returns null from createCourseApplication and must send
 * nothing, or the endpoint would both tell an enumerator that an address is
 * already on file and mail the real applicant twice.
 */
export async function sendCourseApplicationNotifications(
  data: CourseApplicationNotificationData
): Promise<{ admin: SendEmailResult; applicant: SendEmailResult }> {
  const [admin, applicant] = await Promise.all([
    notifyAdminOfApplication(data),
    notifyApplicantOfApplication(data),
  ]);
  return { admin, applicant };
}
