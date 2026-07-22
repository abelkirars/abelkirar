import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { paymentConfirmationSchema } from "@/lib/validations/payment-confirmation";
import { uploadPaymentScreenshot, InvalidScreenshotError } from "@/lib/payment-screenshots";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { notificationService } from "@/lib/notifications";
import { toNotificationData } from "@/lib/orders";

/**
 * Customer submits proof of a Zelle/Cash App payment. This NEVER marks the
 * order as paid — it only stores the submission for an admin to manually
 * verify against the actual Zelle/Cash App account activity.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;

  const ip = clientIpFrom(request);
  const allowed = await checkRateLimit(`confirm-payment:${ip}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submissions recently. Please try again later." },
      { status: 429 }
    );
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.paymentStatus === "PAID") {
    return NextResponse.json(
      { error: "This order has already been marked as paid" },
      { status: 409 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission" }, { status: 400 });
  }

  const amountSentRaw = formData.get("amountSent");
  const parsed = paymentConfirmationSchema.safeParse({
    senderName: formData.get("senderName"),
    amountSent: typeof amountSentRaw === "string" ? Number(amountSentRaw) : NaN,
    sentAt: formData.get("sentAt"),
    transactionReference: formData.get("transactionReference") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const screenshot = formData.get("screenshot");
  let screenshotPath: string | null = null;
  if (screenshot instanceof File && screenshot.size > 0) {
    try {
      screenshotPath = await uploadPaymentScreenshot(order.id, screenshot);
    } catch (err) {
      if (err instanceof InvalidScreenshotError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      console.error("[confirm-payment] Screenshot upload failed:", err);
      return NextResponse.json({ error: "Failed to upload screenshot" }, { status: 500 });
    }
  }

  await prisma.paymentConfirmation.create({
    data: {
      orderId: order.id,
      senderName: parsed.data.senderName,
      amountSent: Math.round(parsed.data.amountSent * 100),
      sentAt: new Date(parsed.data.sentAt),
      transactionReference: parsed.data.transactionReference,
      screenshotPath,
    },
  });

  // Notification failures must never affect a submission that already saved
  // successfully — this is best-effort and intentionally swallows errors.
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;
    const notificationData = toNotificationData(order, `${siteUrl}/admin/orders/${order.orderNumber}`);
    await notificationService.notifyAdminPaymentSubmitted(notificationData);
  } catch (err) {
    console.error("[confirm-payment] Failed to send admin notification:", err);
  }

  return NextResponse.json({ ok: true });
}
