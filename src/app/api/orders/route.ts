import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createOrderSchema } from "@/lib/validations/order";
import { createManualOrder, toNotificationData, OrderCreationError } from "@/lib/orders";
import { notificationService } from "@/lib/notifications";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = clientIpFrom(request);
  const allowed = await checkRateLimit(`create-order:${ip}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many orders created recently. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const t = await getTranslations("validation");
  const parsed = createOrderSchema(t).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  let order: Awaited<ReturnType<typeof createManualOrder>>;
  try {
    order = await createManualOrder(parsed.data);
  } catch (err) {
    if (err instanceof OrderCreationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[orders] Failed to create order:", err);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }

  // The order is already saved at this point — a notification failure must
  // never turn into an error response for an order that succeeded.
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;
    const adminOrderUrl = `${siteUrl}/admin/orders/${order.orderNumber}`;
    const notificationData = toNotificationData(order, adminOrderUrl);

    await Promise.all([
      notificationService.notifyCustomerOrderPending(notificationData),
      notificationService.notifyAdminNewOrder(notificationData),
    ]);
  } catch (err) {
    console.error("[orders] Failed to send order notifications:", err);
  }

  return NextResponse.json({
    orderNumber: order.orderNumber,
    total: order.total,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
  });
}
