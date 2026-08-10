import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { quoteSchema } from "@/lib/validations/quote";
import { notificationService } from "@/lib/notifications";
import { toNotificationData } from "@/lib/orders";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { orderNumber } = await params;
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Guards double-submit — once quoted, the order moves into the existing
  // manual-payment pipeline and this route has nothing left to do.
  if (order.paymentStatus !== "PENDING_QUOTE") {
    return NextResponse.json({ error: "This order is not awaiting a quote" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Server-side region/method pairing guard — never trust the client to
  // only submit a method that matches the order's region. Same pairing
  // rule as createOrderSchema's US_PAYMENT_METHODS check.
  let paymentMethod: "ZELLE" | "CASH_APP" | "EUR_BANK_TRANSFER";
  if (order.paymentRegion === "US") {
    if (parsed.data.paymentMethod !== "ZELLE" && parsed.data.paymentMethod !== "CASH_APP") {
      return NextResponse.json(
        { error: "Select Zelle or Cash App for a US order" },
        { status: 400 }
      );
    }
    paymentMethod = parsed.data.paymentMethod;
  } else {
    // EUROZONE — forced, ignoring any client-supplied method.
    paymentMethod = "EUR_BANK_TRANSFER";
  }

  const totalCents = Math.round(parsed.data.total * 100);

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        subtotal: totalCents,
        total: totalCents,
        paymentMethod,
        paymentStatus: "PENDING_VERIFICATION",
        quotedAt: new Date(),
        quotedById: auth.session.adminId,
      },
    }),
    // The order's one companion OrderItem (see createCustomOrder) also
    // still has unitPrice 0 — this is Problem #2's write-side fix.
    prisma.orderItem.updateMany({
      where: { orderId: order.id },
      data: { unitPrice: totalCents },
    }),
  ]);

  // Re-fetch fresh rather than trusting either statement's own return
  // value from the transaction — no hidden coupling on which fields a
  // template happens to read.
  const updated = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });

  // The quote is already saved at this point. Unlike every other
  // notification in this app, a failed send here is NOT a "log and move
  // on" situation — it's the only way the customer learns they can pay.
  // The outcome is inspected (never thrown) and returned in the response
  // itself so the admin UI can show it directly, not only log it.
  const notificationData = toNotificationData(
    updated,
    `${process.env.NEXT_PUBLIC_SITE_URL as string}/admin/orders/${updated.orderNumber}`
  );
  const emailResult = await notificationService.notifyCustomerQuoteReady(notificationData);
  if (!emailResult.sent) {
    console.error(
      `[quote] Quote-ready email not sent for order ${updated.orderNumber}:`,
      emailResult.error
    );
  }

  // Best-effort, admin-list notification — unlike the customer email above,
  // a failure here must never affect the response: the quote already saved,
  // and the customer's own send result is what the response reports.
  const adminResult = await notificationService.notifyAdminQuoteSent(
    notificationData,
    auth.session.displayName
  );
  if (!adminResult.sent) {
    console.error(
      `[quote] Admin quote-sent email not sent for order ${updated.orderNumber}:`,
      adminResult.error
    );
  }

  return NextResponse.json({
    ok: true,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.error,
  });
}
