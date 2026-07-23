import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { resend } from "@/lib/resend";
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

  if (process.env.RESEND_API_KEY) {
    const tEmail = await getTranslations("emails.newsletterWelcome");
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL as string,
      to: email,
      subject: tEmail("subject"),
      html: `<p>${tEmail("body")}</p>`,
    });
  }

  return NextResponse.json({ ok: true, id: subscriber.id });
}
