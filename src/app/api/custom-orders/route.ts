import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { createCustomOrderSchema } from "@/lib/validations/custom-order";
import {
  createCustomOrder,
  attachCustomOrderImage,
  toCustomOrderNotificationData,
  OrderCreationError,
} from "@/lib/orders";
import {
  uploadCustomOrderImage,
  ALLOWED_CUSTOM_ORDER_IMAGE_TYPES,
  MAX_CUSTOM_ORDER_IMAGE_BYTES,
} from "@/lib/custom-order-images";
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission" }, { status: 400 });
  }

  const t = await getTranslations("validation");
  const parsed = createCustomOrderSchema(t).safeParse({
    productId: formData.get("productId"),
    description: formData.get("description"),
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    paymentRegion: formData.get("paymentRegion"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Reject a bad file before creating anything. The actual upload can't
  // happen yet — its storage path is orders/{orderId}/..., and no orderId
  // exists until the order is created — but type/size checks don't need
  // one, so they run here, against the same canonical constants
  // uploadCustomOrderImage itself enforces below.
  const rawImage = formData.get("customOrderImage");
  const referenceImage = rawImage instanceof File && rawImage.size > 0 ? rawImage : null;
  if (referenceImage) {
    if (!ALLOWED_CUSTOM_ORDER_IMAGE_TYPES.has(referenceImage.type)) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    }
    if (referenceImage.size > MAX_CUSTOM_ORDER_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large" }, { status: 400 });
    }
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

  // The order already exists at this point. Any upload failure from here
  // on is soft: losing the reference photo does not undo a request that
  // already succeeded, and there is no "no order created" option left.
  let imageUploaded: boolean | undefined;
  let imageError: string | undefined;
  if (referenceImage) {
    try {
      const path = await uploadCustomOrderImage(order.id, referenceImage);
      await attachCustomOrderImage(order.id, path);
      imageUploaded = true;
    } catch (err) {
      console.error(
        `[custom-orders] Reference image upload failed for order ${order.orderNumber}:`,
        err
      );
      imageUploaded = false;
      imageError = err instanceof Error ? err.message : "Failed to upload reference image";
    }
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

  return NextResponse.json({
    orderNumber: order.orderNumber,
    ...(imageUploaded !== undefined ? { imageUploaded, ...(imageError ? { imageError } : {}) } : {}),
  });
}
