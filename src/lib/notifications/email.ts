import { resend } from "@/lib/resend";

interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html: string;
}

/** No-ops (with a console warning) if Resend isn't configured — never throws. */
export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.warn("[notifications] RESEND_API_KEY/RESEND_FROM_EMAIL not set — skipping email:", subject);
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("[notifications] Failed to send email:", err);
  }
}

export function adminEmailRecipients(): string[] {
  return (process.env.ADMIN_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}
