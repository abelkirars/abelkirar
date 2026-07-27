import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Replaces the real Prisma-backed module entirely, so no test in this file
// ever opens a real database connection — this is a unit test, not an
// integration test against the live Supabase instance.
vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { __setTwilioClientForTesting } from "@/lib/notifications/twilio-client";
import { sendOrderSms, sendOrderWhatsApp, sendOrderNotifications } from "@/lib/notifications/order-notifications";
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

const ENV_KEYS = [
  "TWILIO_NOTIFICATIONS_ENABLED",
  "TWILIO_SMS_FROM_NUMBER",
  "TWILIO_SMS_RECIPIENTS",
  "TWILIO_WHATSAPP_FROM",
  "TWILIO_WHATSAPP_RECIPIENTS",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  vi.clearAllMocks();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  __setTwilioClientForTesting(null);
  vi.restoreAllMocks();
});

describe("dev-mode preview (Twilio not configured)", () => {
  it("does not touch the database or call Twilio when TWILIO_NOTIFICATIONS_ENABLED is not \"true\"", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "false";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendOrderSms(baseOrder);

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[DEV PREVIEW]"));
  });

  it("prints a redacted preview (masked phone), not the raw configured recipient", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "false";
    process.env.TWILIO_SMS_RECIPIENTS = "+15559998888";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendOrderSms(baseOrder);

    const loggedText = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(loggedText).not.toContain("5559998888");
  });

  it("falls back to preview mode when enabled but recipients are unconfigured", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "true";
    process.env.TWILIO_SMS_FROM_NUMBER = "+15550000000";
    delete process.env.TWILIO_SMS_RECIPIENTS;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendOrderSms(baseOrder);

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[DEV PREVIEW]"));
  });
});

describe("idempotency", () => {
  it("skips the Twilio call entirely when the claim update affects zero rows", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "true";
    process.env.TWILIO_SMS_FROM_NUMBER = "+15550000000";
    process.env.TWILIO_SMS_RECIPIENTS = "+15551112222";
    const create = vi.fn();
    __setTwilioClientForTesting({ messages: { create } } as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 });

    await sendOrderSms(baseOrder);

    expect(create).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("proceeds to send when the claim update affects exactly one row", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "true";
    process.env.TWILIO_SMS_FROM_NUMBER = "+15550000000";
    process.env.TWILIO_SMS_RECIPIENTS = "+15551112222";
    const create = vi.fn().mockResolvedValue({ sid: "SM123", status: "queued" });
    __setTwilioClientForTesting({ messages: { create } } as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);

    await sendOrderSms(baseOrder);

    expect(create).toHaveBeenCalledTimes(1);
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ smsStatus: "SENT", smsMessageSid: "SM123" }),
      })
    );
  });
});

describe("Twilio failure never breaks order creation", () => {
  it("sendOrderSms resolves (does not throw) when Twilio rejects, and records FAILED", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "true";
    process.env.TWILIO_SMS_FROM_NUMBER = "+15550000000";
    process.env.TWILIO_SMS_RECIPIENTS = "+15551112222";
    const create = vi.fn().mockRejectedValue(new Error("network exploded"));
    __setTwilioClientForTesting({ messages: { create } } as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);

    await expect(sendOrderSms(baseOrder)).resolves.toBeUndefined();

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ smsStatus: "FAILED" }) })
    );
  });

  it("sendOrderWhatsApp resolves (does not throw) when Twilio rejects", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "true";
    process.env.TWILIO_WHATSAPP_FROM = "+15550000000";
    process.env.TWILIO_WHATSAPP_RECIPIENTS = "+251911234567";
    const create = vi.fn().mockRejectedValue(new Error("timeout"));
    __setTwilioClientForTesting({ messages: { create } } as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);

    await expect(sendOrderWhatsApp(baseOrder)).resolves.toBeUndefined();

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ whatsappStatus: "FAILED" }) })
    );
  });

  it("sendOrderNotifications never throws even when both channels fail", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "true";
    process.env.TWILIO_SMS_FROM_NUMBER = "+15550000000";
    process.env.TWILIO_SMS_RECIPIENTS = "+15551112222";
    process.env.TWILIO_WHATSAPP_FROM = "+15550000000";
    process.env.TWILIO_WHATSAPP_RECIPIENTS = "+251911234567";
    const create = vi.fn().mockRejectedValue(new Error("boom"));
    __setTwilioClientForTesting({ messages: { create } } as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.order.update).mockResolvedValue({} as never);

    await expect(sendOrderNotifications(baseOrder)).resolves.toBeUndefined();
  });

  it("sendOrderNotifications never throws even if the database mock itself throws", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "true";
    process.env.TWILIO_SMS_FROM_NUMBER = "+15550000000";
    process.env.TWILIO_SMS_RECIPIENTS = "+15551112222";
    process.env.TWILIO_WHATSAPP_FROM = "+15550000000";
    process.env.TWILIO_WHATSAPP_RECIPIENTS = "+251911234567";
    __setTwilioClientForTesting({ messages: { create: vi.fn() } } as never);
    vi.mocked(prisma.order.updateMany).mockRejectedValue(new Error("db unreachable"));

    await expect(sendOrderNotifications(baseOrder)).resolves.toBeUndefined();
  });
});

describe("missing optional order fields never crash a send", () => {
  it("handles an order with no variant, no custom order, and a single item", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "false";
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(sendOrderNotifications(baseOrder)).resolves.toBeUndefined();
  });

  it("handles an order with an empty items array", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "false";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const order: OrderNotificationData = { ...baseOrder, items: [] };

    await expect(sendOrderNotifications(order)).resolves.toBeUndefined();
  });

  it("handles a customOrder object with only one of its two optional fields set", async () => {
    process.env.TWILIO_NOTIFICATIONS_ENABLED = "false";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const order: OrderNotificationData = { ...baseOrder, customOrder: { description: "text only" } };

    await expect(sendOrderNotifications(order)).resolves.toBeUndefined();
  });
});
