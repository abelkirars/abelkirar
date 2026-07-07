import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resend } from "@/lib/resend";
import { contactSchema } from "@/lib/validations/contact";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const submission = await prisma.contactSubmission.create({
    data: parsed.data,
  });

  if (process.env.RESEND_API_KEY && process.env.CONTACT_NOTIFICATION_EMAIL) {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL as string,
      to: process.env.CONTACT_NOTIFICATION_EMAIL,
      subject: `New inquiry: ${parsed.data.topic ?? "General"} — ${parsed.data.name}`,
      html: `
        <p><strong>Name:</strong> ${parsed.data.name}</p>
        <p><strong>Email:</strong> ${parsed.data.email}</p>
        ${parsed.data.phone ? `<p><strong>Phone:</strong> ${parsed.data.phone}</p>` : ""}
        <p><strong>Topic:</strong> ${parsed.data.topic ?? "General"}</p>
        <p><strong>Message:</strong><br/>${parsed.data.message}</p>
      `,
    });
  }

  return NextResponse.json({ ok: true, id: submission.id });
}
