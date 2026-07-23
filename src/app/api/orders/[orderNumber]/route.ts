import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getPaymentInstructions } from "@/lib/notifications/payment-instructions";

/**
 * Public lookup by order number for the customer-facing confirmation page.
 * Order numbers are unguessable random tokens, but this intentionally
 * returns only what a customer needs to see their own order — no admin
 * notes, no confirmedBy identity, no full shipping address.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const instructions =
    order.paymentMethod === "ZELLE" || order.paymentMethod === "CASH_APP"
      ? getPaymentInstructions(
          await getTranslations("paymentInstructions"),
          order.paymentMethod,
          order.orderNumber ?? ""
        )
      : null;

  return NextResponse.json({
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    total: order.total,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      name: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    paymentInstructions: instructions,
  });
}
