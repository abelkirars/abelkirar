import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  clientIpFrom: (request: Request) => request.headers.get("x-forwarded-for") ?? "unknown",
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
}));

const mockCreateManualOrder = vi.fn();
// Full mock, not a partial importOriginal() mock — importing the real
// src/lib/orders.ts pulls in the real src/lib/db.ts, which constructs a
// live PrismaPg adapter/PrismaClient at import time. Every other test file
// that touches this chain mocks @/lib/db before anything imports it;
// nothing proves a bare import is inert here. createManualOrder already
// has its own dedicated unit tests (src/lib/orders.test.ts) — this file
// only needs to prove the route calls it correctly and handles the result.
vi.mock("@/lib/orders", () => {
  class OrderCreationError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return {
    createManualOrder: (...args: unknown[]) => mockCreateManualOrder(...args),
    toNotificationData: (order: unknown) => order,
    OrderCreationError,
  };
});

const mockNotifyCustomerOrderPending = vi.fn();
const mockNotifyAdminNewOrder = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyCustomerOrderPending: (...args: unknown[]) => mockNotifyCustomerOrderPending(...args),
    notifyAdminNewOrder: (...args: unknown[]) => mockNotifyAdminNewOrder(...args),
  },
}));

import { POST } from "@/app/api/orders/route";
import { OrderCreationError } from "@/lib/orders";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  items: [{ productId: "product-1", customization: {}, quantity: 1 }],
  paymentRegion: "US",
  paymentMethod: "ZELLE",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+15555550100",
};

const fakeOrder = {
  id: "order-1",
  orderNumber: "ABK-20260810-AB12C",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+15555550100",
  subtotal: 5000,
  total: 5000,
  currency: "usd",
  paymentMethod: "ZELLE",
  paymentRegion: "US",
  paymentStatus: "PENDING_VERIFICATION",
  status: "PENDING",
  createdAt: new Date("2026-08-10T00:00:00Z"),
  locale: "en",
  items: [{ productNameSnapshot: "Kirar Standard", quantity: 1, variantNameSnapshot: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  mockCheckRateLimit.mockResolvedValue(true);
});

describe("POST /api/orders", () => {
  it("returns 429 and creates no order when the rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue(false);

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(429);
    expect(mockCreateManualOrder).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await POST(buildRequest("not-json"));

    expect(res.status).toBe(400);
    expect(mockCreateManualOrder).not.toHaveBeenCalled();
  });

  it("returns 400 with the zod message on a validation failure, and creates no order", async () => {
    const res = await POST(buildRequest({ ...validBody, customerEmail: "not-an-email" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("enterValidEmail");
    expect(mockCreateManualOrder).not.toHaveBeenCalled();
  });

  it("returns 400 for a US order with paymentMethod EUR_BANK_TRANSFER — the region/method pairing refine", async () => {
    const res = await POST(
      buildRequest({ ...validBody, paymentRegion: "US", paymentMethod: "EUR_BANK_TRANSFER" })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("paymentMethodMismatch");
    expect(mockCreateManualOrder).not.toHaveBeenCalled();
  });

  it("happy path: creates the order and returns exactly orderNumber, total, currency, paymentMethod", async () => {
    mockCreateManualOrder.mockResolvedValue(fakeOrder);
    mockNotifyCustomerOrderPending.mockResolvedValue({ sent: true });
    mockNotifyAdminNewOrder.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      orderNumber: "ABK-20260810-AB12C",
      total: 5000,
      currency: "usd",
      paymentMethod: "ZELLE",
    });
    expect(mockCreateManualOrder).toHaveBeenCalledTimes(1);
    expect(mockNotifyCustomerOrderPending).toHaveBeenCalledTimes(1);
    expect(mockNotifyAdminNewOrder).toHaveBeenCalledTimes(1);
  });

  it("still returns 200 with the order created when the customer notification fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateManualOrder.mockResolvedValue(fakeOrder);
    mockNotifyCustomerOrderPending.mockResolvedValue({ sent: false, error: "send failed" });
    mockNotifyAdminNewOrder.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderNumber).toBe("ABK-20260810-AB12C");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("still returns 200 with the order created when the admin notification fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateManualOrder.mockResolvedValue(fakeOrder);
    mockNotifyCustomerOrderPending.mockResolvedValue({ sent: true });
    mockNotifyAdminNewOrder.mockResolvedValue({ sent: false, error: "send failed" });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderNumber).toBe("ABK-20260810-AB12C");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns the OrderCreationError's own status and message, not a generic 500", async () => {
    mockCreateManualOrder.mockRejectedValue(
      new OrderCreationError("Product product-9 not found or inactive", 400)
    );

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Product product-9 not found or inactive");
  });
});
