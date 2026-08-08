import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { createCustomOrderSchema } from "@/lib/validations/custom-order";
import { createCustomOrder, toCustomOrderNotificationData, OrderCreationError } from "@/lib/orders";
import { notificationService } from "@/lib/notifications";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import type { Locale } from "@/i18n/locale";

/**
 * Customer submits a Custom Made quote request. No price is computed or
 * shown here — this only records the request (description + contact
 * details + region) and starts it at PaymentStatus.PENDING_QUOTE. An admin
 * sets the real price later via a separate action (Phase 4).
 */
export async function POST(request: Request) {
  const ip = clientIpFrom(request);
  const allowed = await checkRateLimit(`create-custom-order:${ip}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests recently. Please try again later." },
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
  const parsed = createCustomOrderSchema(t).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  let order: Awaited<ReturnType<typeof createCustomOrder>>;
  try {
    const locale = (await getLocale()) as Locale;
    order = await createCustomOrder(parsed.data, locale);
  } catch (err) {
    if (err instanceof OrderCreationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[custom-orders] Failed to create custom order:", err);
    return NextResponse.json({ error: "Failed to submit custom order request" }, { status: 500 });
  }

  // The order is already saved at this point — a notification failure must
  // never turn into an error response for a request that succeeded.
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;
    const adminOrderUrl = `${siteUrl}/admin/orders/${order.orderNumber}`;
    const notificationData = toCustomOrderNotificationData(order, adminOrderUrl);

    const [customerResult, adminResult] = await Promise.all([
      notificationService.notifyCustomerCustomOrderPending(notificationData),
      notificationService.notifyAdminNewCustomOrder(notificationData),
    ]);

    if (!customerResult.sent) {
      console.error(
        `[custom-orders] Customer custom-order-pending email not sent for order ${order.orderNumber}:`,
        customerResult.error
      );
    }
    if (!adminResult.sent) {
      console.error(
        `[custom-orders] Admin new-custom-order email not sent for order ${order.orderNumber}:`,
        adminResult.error
      );
    }
  } catch (err) {
    console.error("[custom-orders] Failed to send custom order notifications:", err);
  }

  return NextResponse.json({ orderNumber: order.orderNumber });
}
