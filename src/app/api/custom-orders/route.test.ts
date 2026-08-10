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

const mockCreateCustomOrder = vi.fn();
// Same reasoning as src/app/api/orders/route.test.ts — full mock of
// @/lib/orders, not a partial importOriginal() one, to avoid importing the
// real src/lib/db.ts. createCustomOrder's own logic (including the missing/
// inactive/not-custom-made product guard) is already covered by
// src/lib/orders.test.ts.
vi.mock("@/lib/orders", () => {
  class OrderCreationError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return {
    createCustomOrder: (...args: unknown[]) => mockCreateCustomOrder(...args),
    toCustomOrderNotificationData: (order: unknown) => order,
    OrderCreationError,
  };
});

const mockNotifyCustomerCustomOrderPending = vi.fn();
const mockNotifyAdminNewCustomOrder = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyCustomerCustomOrderPending: (...args: unknown[]) => mockNotifyCustomerCustomOrderPending(...args),
    notifyAdminNewCustomOrder: (...args: unknown[]) => mockNotifyAdminNewCustomOrder(...args),
  },
}));

import { POST } from "@/app/api/custom-orders/route";
import { OrderCreationError } from "@/lib/orders";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/custom-orders", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  productId: "product-1",
  description: "A custom kirar with a hand-carved rosette, please make it beautiful.",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+15555550100",
  paymentRegion: "US",
};

const fakeCustomOrder = {
  id: "order-2",
  orderNumber: "ABK-20260810-CD34E",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+15555550100",
  customOrderDescription: validBody.description,
  paymentRegion: "US",
  createdAt: new Date("2026-08-10T00:00:00Z"),
  locale: "en",
  items: [{ productNameSnapshot: "Kirar Standard" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  mockCheckRateLimit.mockResolvedValue(true);
});

describe("POST /api/custom-orders", () => {
  it("returns 429 and creates no order when the rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue(false);

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(429);
    expect(mockCreateCustomOrder).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await POST(buildRequest("not-json"));

    expect(res.status).toBe(400);
    expect(mockCreateCustomOrder).not.toHaveBeenCalled();
  });

  it("returns 400 with the zod message on a validation failure, and creates no order", async () => {
    const res = await POST(buildRequest({ ...validBody, description: "too short" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("enterCustomOrderDescription");
    expect(mockCreateCustomOrder).not.toHaveBeenCalled();
  });

  it("happy path: response contains ONLY orderNumber — no total, currency, or paymentMethod", async () => {
    mockCreateCustomOrder.mockResolvedValue(fakeCustomOrder);
    mockNotifyCustomerCustomOrderPending.mockResolvedValue({ sent: true });
    mockNotifyAdminNewCustomOrder.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    // toEqual (not objectContaining) — a future change that leaks total,
    // currency, or paymentMethod (even a 0 total) into this response fails
    // here. This is the only place that regression could be caught.
    expect(body).toEqual({ orderNumber: "ABK-20260810-CD34E" });
  });

  it("still returns 200 with the order created when the customer notification fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateCustomOrder.mockResolvedValue(fakeCustomOrder);
    mockNotifyCustomerCustomOrderPending.mockResolvedValue({ sent: false, error: "send failed" });
    mockNotifyAdminNewCustomOrder.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderNumber).toBe("ABK-20260810-CD34E");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("still returns 200 with the order created when the admin notification fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateCustomOrder.mockResolvedValue(fakeCustomOrder);
    mockNotifyCustomerCustomOrderPending.mockResolvedValue({ sent: true });
    mockNotifyAdminNewCustomOrder.mockResolvedValue({ sent: false, error: "send failed" });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderNumber).toBe("ABK-20260810-CD34E");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns the OrderCreationError's own status and message, not a generic 500 — covers missing/inactive/not-custom-made uniformly, since createCustomOrder throws the identical error for all three (see src/lib/orders.test.ts for the three cases distinguished at the function level)", async () => {
    mockCreateCustomOrder.mockRejectedValue(
      new OrderCreationError("Product not found or not available for custom orders", 400)
    );

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Product not found or not available for custom orders");
  });
});
