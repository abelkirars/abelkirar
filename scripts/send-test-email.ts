/**
 * Sends one test admin notification email to every address configured in
 * ADMIN_NOTIFICATION_EMAILS — no real order is created or touched. Safe by
 * default: if RESEND_API_KEY or RESEND_FROM_EMAIL isn't set, the underlying
 * sendEmail() call warns and returns without making any network request.
 *
 * Usage: npx tsx scripts/send-test-email.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { sendEmail, adminEmailRecipients } = await import("../src/lib/notifications/email");

  const recipients = adminEmailRecipients();
  if (!recipients.length) {
    console.log(
      "ADMIN_NOTIFICATION_EMAILS is empty — nothing to send to. Set it in .env.local first."
    );
    return;
  }

  console.log(`Sending one test email to ${recipients.length} recipient(s)...`);

  await sendEmail({
    to: recipients,
    subject: "Abelkirar admin notifications — test email",
    html: `
      <p>This is a test of the admin order-notification email channel.</p>
      <p>If you received this, admin email notifications are working correctly.</p>
      <p>No real order was created to send this message.</p>
    `,
  });

  console.log("Done. Check the logs above — if RESEND_API_KEY/RESEND_FROM_EMAIL aren't set, this was a safe no-op.");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
