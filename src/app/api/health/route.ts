import { prisma } from "@/lib/db";
import { adminEmailRecipients } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

/**
 * Presence and counts ONLY — never a value.
 *
 * This endpoint is unauthenticated, so nothing here may be reversible into a
 * secret. `Boolean(...)` collapses an API key to true/false, and only the
 * LENGTH of the recipient list is read, never an address. A reader learns
 * whether notifications are configured, and nothing whatsoever about how.
 *
 * It exists because a misconfigured Resend key was previously invisible until
 * an applicant submitted the form and nobody was told — a failure that lived
 * only in a runtime log. Loading this URL after a deploy answers the same
 * question in seconds, before it costs anyone an application.
 */
function notificationConfig() {
  return {
    resendApiKey: Boolean(process.env.RESEND_API_KEY),
    resendFromEmail: Boolean(process.env.RESEND_FROM_EMAIL),
    adminRecipients: adminEmailRecipients().length,
  };
}

export async function GET() {
  const notifications = notificationConfig();

  try {
    // Exercise the product schema, not just the connection, to detect missing migrations.
    await prisma.product.findFirst();
    return Response.json(
      { status: "ok", catalog: "available", notifications },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // `status` deliberately reflects the DATABASE only. Missing notification
    // configuration is reported as data rather than folded into the status,
    // so an uptime check watching this endpoint keeps meaning "can the site
    // serve its catalogue" and does not start flapping on a Preview that was
    // never given mail credentials. Read the booleans to answer the other
    // question.
    return Response.json(
      { status: "degraded", catalog: "unavailable", notifications },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
