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

    await Promise.all([
      notificationService.notifyCustomerPaymentConfirmed(notificationData),
      notificationService.notifyAdminPaymentConfirmed(notificationData, auth.session.displayName),
    ]);
  } catch (err) {
    console.error("[mark-paid] Failed to send notifications:", err);
  }

  return NextResponse.json({ ok: true });
}
