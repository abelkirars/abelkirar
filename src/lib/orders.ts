import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeUnitPrice } from "@/lib/pricing";
import { generateOrderNumber } from "@/lib/order-number";
import type { CreateOrderInput } from "@/lib/validations/order";
import type { CreateCustomOrderInput } from "@/lib/validations/custom-order";
import type { OrderNotificationData, CustomOrderNotificationData } from "@/lib/notifications/types";
import type { Locale } from "@/i18n/locale";

export class OrderCreationError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
  }
}

const MAX_ORDER_NUMBER_ATTEMPTS = 5;

/**
 * Creates a manual-payment (Zelle/Cash App) order. Prices are always
 * recomputed server-side from the product's base price and customization
 * choices — a client-supplied price is never trusted.
 */
export async function createManualOrder(input: CreateOrderInput, locale: Locale) {
  const products = await prisma.product.findMany({
    where: { id: { in: input.items.map((i) => i.productId) }, isActive: true },
  });

  const lineItems = input.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      throw new OrderCreationError(`Product ${item.productId} not found or inactive`);
    }
    const unitPrice = computeUnitPrice(product, item.customization);
    return { product, item, unitPrice };
  });

  const subtotal = lineItems.reduce(
    (sum, li) => sum + li.unitPrice * li.item.quantity,
    0
  );

  // No automatic currency conversion — the numeric total is always the
  // product's base price; selecting Eurozone only changes which currency
  // label it's tagged and displayed with, not the amount charged.
  const currency = input.paymentRegion === "EUROZONE" ? "eur" : "usd";

  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    const orderNumber = generateOrderNumber();
    try {
      const order = await prisma.order.create({
        data: {
          orderNumber,
          orderType: "PRODUCT",
          status: "PENDING",
          paymentRegion: input.paymentRegion,
          paymentMethod: input.paymentMethod,
          paymentStatus: "PENDING_VERIFICATION",
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          locale,
          subtotal,
          total: subtotal,
          currency,
          items: {
            create: lineItems.map(({ product, item, unitPrice }) => ({
              productId: product.id,
              selectedCustomization: item.customization,
              unitPrice,
              quantity: item.quantity,
              productNameSnapshot: product.name,
              productImageSnapshot: (product.images as string[])[0],
              variantNameSnapshot: product.variantName,
            })),
          },
        },
        include: { items: true },
      });
      return order;
    } catch (err) {
      const isUniqueClash =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("orderNumber");
      if (!isUniqueClash || attempt === MAX_ORDER_NUMBER_ATTEMPTS - 1) throw err;
    }
  }

  throw new OrderCreationError("Could not generate a unique order number", 500);
}

/**
 * Creates a Custom Made quote-request order. No price exists yet —
 * subtotal/total are written as 0 (a placeholder, not a real price) and
 * paymentStatus starts at PENDING_QUOTE. An admin sets the real total later
 * via the admin quote action (Phase 4), at which point paymentStatus moves
 * into the existing PENDING_VERIFICATION pipeline. No code anywhere may
 * treat total === 0 as a meaningful price — always branch on paymentStatus
 * first (see the order confirmation and admin order pages).
 */
export async function createCustomOrder(input: CreateCustomOrderInput, locale: Locale) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product || !product.isActive || !product.isCustomMade) {
    // Never trust that the client only rendered this form on a valid,
    // currently-custom-made product.
    throw new OrderCreationError("Product not found or not available for custom orders");
  }

  const currency = input.paymentRegion === "EUROZONE" ? "eur" : "usd";

  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    const orderNumber = generateOrderNumber();
    try {
      const order = await prisma.order.create({
        data: {
          orderNumber,
          orderType: "CUSTOM_QUOTE",
          status: "PENDING",
          paymentRegion: input.paymentRegion,
          paymentStatus: "PENDING_QUOTE",
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          customOrderDescription: input.description,
          locale,
          subtotal: 0,
          total: 0,
          currency,
          items: {
            create: [
              {
                productId: product.id,
                selectedCustomization: {},
                unitPrice: 0,
                quantity: 1,
                productNameSnapshot: product.name,
                productImageSnapshot: (product.images as string[])[0],
                variantNameSnapshot: product.variantName,
              },
            ],
          },
        },
        include: { items: true },
      });
      return order;
    } catch (err) {
      const isUniqueClash =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("orderNumber");
      if (!isUniqueClash || attempt === MAX_ORDER_NUMBER_ATTEMPTS - 1) throw err;
    }
  }

  throw new OrderCreationError("Could not generate a unique order number", 500);
}

export function toCustomOrderNotificationData(
  order: {
    id: string;
    orderNumber: string | null;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    customOrderDescription: string | null;
    paymentRegion: string | null;
    createdAt: Date;
    locale: string;
    items: { productNameSnapshot: string }[];
  },
  adminOrderUrl: string
): CustomOrderNotificationData {
  return {
    id: order.id,
    orderNumber: order.orderNumber ?? "(unknown)",
    customerName: order.customerName ?? "(unknown)",
    customerEmail: order.customerEmail ?? "",
    customerPhone: order.customerPhone ?? "",
    description: order.customOrderDescription ?? "",
    productName: order.items[0]?.productNameSnapshot ?? "(unknown product)",
    paymentRegion: (order.paymentRegion as "US" | "EUROZONE" | null) ?? "US",
    locale: order.locale,
    createdAt: order.createdAt,
    adminOrderUrl,
  };
}

export function toNotificationData(
  order: {
    id: string;
    orderNumber: string | null;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    subtotal: number;
    total: number;
    currency: string;
    paymentMethod: string | null;
    paymentRegion: string | null;
    paymentStatus: string;
    status: string;
    createdAt: Date;
    locale: string;
    items: { productNameSnapshot: string; quantity: number; variantNameSnapshot: string | null }[];
  },
  adminOrderUrl: string
): OrderNotificationData {
  return {
    id: order.id,
    orderNumber: order.orderNumber ?? "(unknown)",
    customerName: order.customerName ?? "(unknown)",
    customerEmail: order.customerEmail ?? "",
    customerPhone: order.customerPhone ?? "",
    subtotal: order.subtotal,
    total: order.total,
    currency: order.currency,
    paymentMethod: (order.paymentMethod as "ZELLE" | "CASH_APP" | "EUR_BANK_TRANSFER") ?? "ZELLE",
    paymentRegion: (order.paymentRegion as "US" | "EUROZONE" | null) ?? "US",
    paymentStatus: order.paymentStatus,
    orderStatus: order.status,
    createdAt: order.createdAt,
    locale: order.locale,
    items: order.items.map((i) => ({
      name: i.productNameSnapshot,
      quantity: i.quantity,
      variantName: i.variantNameSnapshot ?? undefined,
    })),
    // customOrder intentionally omitted — no checkout-time capture path exists yet.
    adminOrderUrl,
  };
}
