import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resend } from "@/lib/resend";
import { newsletterSchema } from "@/lib/validations/newsletter";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = newsletterSchema.safeParse(body);

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
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL as string,
      to: email,
      subject: "Welcome to Abelkirar",
      html: `<p>Thank you for joining the Abelkirar community. You'll hear from us with Kirar lessons, new instruments, and community events.</p>`,
    });
  }

  return NextResponse.json({ ok: true, id: subscriber.id });
}
