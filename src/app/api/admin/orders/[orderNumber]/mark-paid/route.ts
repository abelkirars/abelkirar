import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { notificationService } from "@/lib/notifications";
import { toNotificationData } from "@/lib/orders";

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

  // A Custom Made order with no quote yet has no real price — mirrors the
  // guard in quote/route.ts:23-25. The button that reaches this route is
  // hidden client-side (order-actions.tsx) but that is not a server-side
  // guarantee; this is.
  if (order.paymentStatus === "PENDING_QUOTE") {
    return NextResponse.json(
      { error: "This order is awaiting a quote and has no price to confirm as paid" },
      { status: 409 }
    );
  }

  // Prevent duplicate confirmation: once paid, this is a no-op 409, not a
  // silent re-confirmation that would overwrite who/when it was confirmed.
  if (order.paymentStatus === "PAID") {
    return NextResponse.json({ error: "Order is already marked as paid" }, { status: 409 });
  }
  if (order.status === "CANCELLED") {
    return NextResponse.json({ error: "Cannot mark a cancelled order as paid" }, { status: 409 });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "PAID",
      status: "PROCESSING",
      paymentConfirmedById: auth.session.adminId,
      paymentConfirmedAt: new Date(),
    },
    include: { items: true },
  });

  // The order is already marked paid at this point — a notification failure
  // must never affect a status change that already saved successfully.
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;
    const notificationData = toNotificationData(
      updated,
      `${siteUrl}/admin/orders/${updated.orderNumber}`
    );

    const [customerResult, adminResult] = await Promise.all([
      notificationService.notifyCustomerPaymentConfirmed(notificationData),
      notificationService.notifyAdminPaymentConfirmed(notificationData, auth.session.displayName),
    ]);

    if (!customerResult.sent) {
      console.error(
        `[mark-paid] Customer payment-confirmed email not sent for order ${updated.orderNumber}:`,
        customerResult.error
      );
    }
    if (!adminResult.sent) {
      console.error(
        `[mark-paid] Admin payment-confirmed email not sent for order ${updated.orderNumber}:`,
        adminResult.error
      );
    }
  } catch (err) {
    console.error("[mark-paid] Failed to send notifications:", err);
  }

  return NextResponse.json({ ok: true });
}
