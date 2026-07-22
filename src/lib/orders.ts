import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeUnitPrice } from "@/lib/pricing";
import { generateOrderNumber } from "@/lib/order-number";
import type { CreateOrderInput } from "@/lib/validations/order";
import type { OrderNotificationData } from "@/lib/notifications/types";

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
export async function createManualOrder(input: CreateOrderInput) {
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

export function toNotificationData(
  order: {
    orderNumber: string | null;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    total: number;
    currency: string;
    paymentMethod: string | null;
    paymentRegion: string | null;
    paymentStatus: string;
    status: string;
    createdAt: Date;
    items: { productNameSnapshot: string; quantity: number }[];
  },
  adminOrderUrl: string
): OrderNotificationData {
  return {
    orderNumber: order.orderNumber ?? "(unknown)",
    customerName: order.customerName ?? "(unknown)",
    customerEmail: order.customerEmail ?? "",
    customerPhone: order.customerPhone ?? "",
    total: order.total,
    currency: order.currency,
    paymentMethod: (order.paymentMethod as "ZELLE" | "CASH_APP" | "EUR_BANK_TRANSFER") ?? "ZELLE",
    paymentRegion: (order.paymentRegion as "US" | "EUROZONE" | null) ?? "US",
    paymentStatus: order.paymentStatus,
    orderStatus: order.status,
    createdAt: order.createdAt,
    items: order.items.map((i) => ({ name: i.productNameSnapshot, quantity: i.quantity })),
    adminOrderUrl,
  };
}
