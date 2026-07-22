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
  if (order.paymentStatus === "PAID") {
    return NextResponse.json(
      { error: "Cannot mark an already-paid order as payment not found" },
      { status: 409 }
    );
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: "PAYMENT_NOT_FOUND" },
    include: { items: true },
  });

  // Notification failures must never affect a status change that already
  // saved successfully — this is best-effort and intentionally swallows errors.
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;
    const notificationData = toNotificationData(
      updated,
      `${siteUrl}/admin/orders/${updated.orderNumber}`
    );
    await notificationService.notifyAdminPaymentNotFound(notificationData);
  } catch (err) {
    console.error("[mark-not-found] Failed to send admin notification:", err);
  }

  return NextResponse.json({ ok: true });
}
