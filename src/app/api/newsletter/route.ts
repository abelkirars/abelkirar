import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";
import { createNewsletterSchema } from "@/lib/validations/newsletter";

export async function POST(request: Request) {
  const body = await request.json();
  const t = await getTranslations("validation");
  const parsed = createNewsletterSchema(t).safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { email, source } = parsed.data;

  const subscriber = await prisma.newsletterSubscriber.upsert({
    where: { email },
    update: {},
    create: { email, source },
  });

  // The subscriber is already saved at this point — a notification failure
  // must never turn into an error response for a signup that succeeded.
  const tEmail = await getTranslations("emails.newsletterWelcome");
  const emailResult = await sendEmail({
    to: email,
    subject: tEmail("subject"),
    html: `<p>${tEmail("body")}</p>`,
  });
  if (!emailResult.sent) {
    console.error(`[newsletter] Welcome email not sent for ${subscriber.id}:`, emailResult.error);
  }

  return NextResponse.json({ ok: true, id: subscriber.id });
}
