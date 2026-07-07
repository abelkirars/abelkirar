import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { computeUnitPrice } from "@/lib/pricing";
import type { SelectedCustomization } from "@/types/customization";

interface CheckoutItem {
  productId: string;
  customization: SelectedCustomization;
  quantity: number;
}

const SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection["allowed_countries"] =
  [
    "US",
    "GB",
    "IE",
    "DE",
    "FR",
    "IT",
    "ES",
    "NL",
    "BE",
    "AT",
    "SE",
    "NO",
    "DK",
    "CH",
  ];

export async function POST(request: Request) {
  const body = (await request.json()) as { items: CheckoutItem[] };

  if (!body.items?.length) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: body.items.map((i) => i.productId) }, isActive: true },
  });

  const lineItems = body.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      throw new Error(`Product ${item.productId} not found or inactive`);
    }
    const unitPrice = computeUnitPrice(product, item.customization);
    return { product, item, unitPrice };
  });

  const subtotal = lineItems.reduce(
    (sum, li) => sum + li.unitPrice * li.item.quantity,
    0
  );

  const order = await prisma.order.create({
    data: {
      orderType: "PRODUCT",
      subtotal,
      total: subtotal,
      currency: "usd",
      items: {
        create: lineItems.map(({ product, item, unitPrice }) => ({
          productId: product.id,
          selectedCustomization: item.customization,
          unitPrice,
          quantity: item.quantity,
          productNameSnapshot: product.name,
          productImageSnapshot: (product.images as string[])[0],
        })),
      },
    },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL as string;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems.map(({ product, item, unitPrice }) => ({
      price_data: {
        currency: "usd",
        unit_amount: unitPrice,
        product_data: {
          name: product.name,
          images: product.images && (product.images as string[])[0]?.startsWith("http")
            ? [(product.images as string[])[0]]
            : undefined,
          metadata: { productId: product.id },
        },
      },
      quantity: item.quantity,
    })),
    metadata: { orderId: order.id },
    payment_intent_data: { metadata: { orderId: order.id } },
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
    success_url: `${siteUrl}/store/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/store/cart`,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return NextResponse.json({ url: session.url });
}
