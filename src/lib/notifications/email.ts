import { resend } from "@/lib/resend";

interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html: string;
  /** Course jobs must not log raw provider errors, recipients or message bodies. */
  redactErrors?: boolean;
}

export interface SendEmailResult {
  sent: boolean;
  /** Present only when sent is false — a human-readable reason, safe to surface in an admin UI. */
  error?: string;
}

/**
 * Never throws — always resolves with a result the caller can inspect. This
 * matters because the Resend SDK itself does NOT throw on an API-level
 * rejection (e.g. an unverified sending domain, a monthly quota limit); it
 * resolves normally with `{ data: null, error: {...} }`. A bare `try/catch`
 * around the call only ever catches network-level failures and silently
 * missed every one of these API-level rejections — that was a real bug
 * (invite emails failing 100% of the time with zero visible error). Both
 * failure shapes are logged here and returned uniformly, so every caller
 * gets the same real answer regardless of which way the send failed.
 */
export async function sendEmail({ to, subject, html, redactErrors = false }: SendEmailArgs): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.warn("[notifications] RESEND_API_KEY/RESEND_FROM_EMAIL not set — skipping email:", redactErrors ? "course notification" : subject);
    return { sent: false, error: "Email is not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[notifications] Resend rejected the email:", redactErrors ? "Provider rejected course notification" : error);
      return { sent: false, error: redactErrors ? "Email provider rejected notification" : error.message };
    }

    return { sent: true };
  } catch (err) {
    console.error("[notifications] Failed to send email:", redactErrors ? "Course notification transport failed" : err);
    return { sent: false, error: redactErrors ? "Email transport failed" : err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Deduplicates case-insensitively (owner@x.com and Owner@X.com are the same
 * mailbox) but preserves the casing of the first occurrence in the output —
 * a config typo shouldn't silently double-send to the same inbox.
 */
export function adminEmailRecipients(): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const email of (process.env.ADMIN_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }
  return recipients;
}
