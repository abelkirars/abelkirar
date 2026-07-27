import { describe, it, expect } from "vitest";
import { newOrderTwilioMessage } from "@/lib/notifications/templates";
import type { OrderNotificationData } from "@/lib/notifications/types";

const baseOrder: OrderNotificationData = {
  id: "order_123",
  orderNumber: "AK-1001",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+15551234567",
  subtotal: 42000,
  total: 42000,
  currency: "usd",
  paymentMethod: "ZELLE",
  paymentRegion: "US",
  paymentStatus: "PENDING_VERIFICATION",
  orderStatus: "PENDING",
  createdAt: new Date("2026-01-01T12:00:00Z"),
  items: [{ name: "Normal Kirar", quantity: 1 }],
  adminOrderUrl: "https://example.com/admin/orders/AK-1001",
  locale: "en",
};

describe("newOrderTwilioMessage", () => {
  it("includes every required field", () => {
    const msg = newOrderTwilioMessage(baseOrder);
    expect(msg).toContain("NEW ORDER");
    expect(msg).toContain(baseOrder.orderNumber);
    expect(msg).toContain(baseOrder.customerName);
    expect(msg).toContain(baseOrder.customerPhone);
    expect(msg).toContain(baseOrder.customerEmail);
    expect(msg).toContain("1 × Normal Kirar");
    expect(msg).toContain("$420.00");
    expect(msg).toContain("Pending verification");
    expect(msg).toContain("PENDING");
    expect(msg).toContain(baseOrder.adminOrderUrl);
  });

  it("includes the variant name in parentheses when present", () => {
    const order: OrderNotificationData = {
      ...baseOrder,
      items: [{ name: "Kirar", quantity: 2, variantName: "Desalegn Kirar" }],
    };
    const msg = newOrderTwilioMessage(order);
    expect(msg).toContain("2 × Kirar (Desalegn Kirar)");
  });

  it("omits the variant parentheses when not present", () => {
    const msg = newOrderTwilioMessage(baseOrder);
    expect(msg).not.toContain("()");
    expect(msg).toContain("1 × Normal Kirar");
  });

  it("omits the custom-order section entirely when not provided", () => {
    const msg = newOrderTwilioMessage(baseOrder);
    expect(msg).not.toContain("Custom order");
  });

  it("includes the custom-order section when both description and image are provided", () => {
    const order: OrderNotificationData = {
      ...baseOrder,
      customOrder: { description: "Blue finish please", imageUrl: "https://example.com/ref.png" },
    };
    const msg = newOrderTwilioMessage(order);
    expect(msg).toContain("Custom order details: Blue finish please");
    expect(msg).toContain("Custom order image: https://example.com/ref.png");
  });

  it("renders only the description line when the image is missing", () => {
    const order: OrderNotificationData = {
      ...baseOrder,
      customOrder: { description: "Just text, no image" },
    };
    const msg = newOrderTwilioMessage(order);
    expect(msg).toContain("Custom order details: Just text, no image");
    expect(msg).not.toContain("Custom order image:");
  });

  it("renders only the image line when the description is missing", () => {
    const order: OrderNotificationData = {
      ...baseOrder,
      customOrder: { imageUrl: "https://example.com/ref.png" },
    };
    const msg = newOrderTwilioMessage(order);
    expect(msg).not.toContain("Custom order details:");
    expect(msg).toContain("Custom order image: https://example.com/ref.png");
  });

  it("does not crash and omits the section for an empty customOrder object", () => {
    const order: OrderNotificationData = { ...baseOrder, customOrder: {} };
    expect(() => newOrderTwilioMessage(order)).not.toThrow();
    expect(newOrderTwilioMessage(order)).not.toContain("Custom order");
  });

  it("does not crash with an empty items array", () => {
    const order: OrderNotificationData = { ...baseOrder, items: [] };
    expect(() => newOrderTwilioMessage(order)).not.toThrow();
  });

  it("renders multiple items, each on its own line", () => {
    const order: OrderNotificationData = {
      ...baseOrder,
      items: [
        { name: "Normal Kirar", quantity: 1 },
        { name: "Processional Begena", quantity: 2, variantName: "Large" },
      ],
    };
    const msg = newOrderTwilioMessage(order);
    expect(msg).toContain("1 × Normal Kirar");
    expect(msg).toContain("2 × Processional Begena (Large)");
  });

  it("formats subtotal and total separately", () => {
    const order: OrderNotificationData = { ...baseOrder, subtotal: 40000, total: 42000 };
    const msg = newOrderTwilioMessage(order);
    expect(msg).toContain("$400.00");
    expect(msg).toContain("$420.00");
  });
});
