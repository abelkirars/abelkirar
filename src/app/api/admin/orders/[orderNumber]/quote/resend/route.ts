import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { notificationService } from "@/lib/notifications";
import { toNotificationData } from "@/lib/orders";

/**
 * Re-sends the quote-ready email with the order's already-stored total and
 * paymentMethod. Changes NO order data — this exists because the original
 * /quote route's 409 guard (paymentStatus must be PENDING_QUOTE) would
 * otherwise make a failed send a dead end: once quoted, paymentStatus has
 * already moved to PENDING_VERIFICATION, so /quote can never be called
 * again for this order. Available any time quotedAt is set, not only after
 * a failure — an admin may need this if a customer says they never
 * received the email.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { orderNumber } = await params;
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!order.quotedAt) {
    return NextResponse.json({ error: "This order has not been quoted yet" }, { status: 409 });
  }

  const notificationData = toNotificationData(
    order,
    `${process.env.NEXT_PUBLIC_SITE_URL as string}/admin/orders/${order.orderNumber}`
  );
  const emailResult = await notificationService.notifyCustomerQuoteReady(notificationData);
  if (!emailResult.sent) {
    console.error(
      `[quote-resend] Quote-ready email not sent for order ${order.orderNumber}:`,
      emailResult.error
    );
  }

  return NextResponse.json({
    ok: true,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.error,
  });
}
