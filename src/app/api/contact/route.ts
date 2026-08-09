import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";
import { createContactSchema } from "@/lib/validations/contact";

export async function POST(request: Request) {
  const body = await request.json();
  const t = await getTranslations("validation");
  const parsed = createContactSchema(t).safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const submission = await prisma.contactSubmission.create({
    data: parsed.data,
  });

  // The submission is already saved at this point — a notification failure
  // must never turn into an error response for a submission that succeeded.
  if (process.env.CONTACT_NOTIFICATION_EMAIL) {
    const emailResult = await sendEmail({
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
    if (!emailResult.sent) {
      console.error(
        `[contact] Admin notification email not sent for submission ${submission.id}:`,
        emailResult.error
      );
    }
  }

  return NextResponse.json({ ok: true, id: submission.id });
}
