import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueOrder = vi.fn();
const mockUpdateOrder = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => mockFindUniqueOrder(...args),
      update: (...args: unknown[]) => mockUpdateOrder(...args),
    },
  },
}));

const mockNotifyCustomerQuoteReady = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyCustomerQuoteReady: (...args: unknown[]) => mockNotifyCustomerQuoteReady(...args),
  },
}));

import { POST } from "@/app/api/admin/orders/[orderNumber]/quote/resend/route";

function buildRequest(): Request {
  return new Request("http://localhost/api/admin/orders/ABK-20260808-F5539/quote/resend", {
    method: "POST",
  });
}

function buildParams(orderNumber = "ABK-20260808-F5539") {
  return { params: Promise.resolve({ orderNumber }) };
}

function quotedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "ABK-20260808-F5539",
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    customerPhone: "+15555550100",
    subtotal: 20000,
    total: 20000,
    currency: "usd",
    paymentMethod: "ZELLE",
    paymentRegion: "US",
    // Already moved past PENDING_QUOTE by a prior successful /quote call —
    // this is the normal state a resend is used from.
    paymentStatus: "PENDING_VERIFICATION",
    status: "PENDING",
    quotedAt: new Date("2026-08-08T12:00:00Z"),
    createdAt: new Date("2026-08-08T00:00:00Z"),
    locale: "en",
    items: [{ productNameSnapshot: "Custom Kirar", quantity: 1, variantNameSnapshot: null }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
});

describe("POST /api/admin/orders/[orderNumber]/quote/resend", () => {
  it("rejects a non-admin caller before any DB call happens", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(401);
    expect(mockFindUniqueOrder).not.toHaveBeenCalled();
  });

  it("returns 404 when the order does not exist", async () => {
    mockFindUniqueOrder.mockResolvedValue(null);

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(404);
  });

  it("returns 409 when the order has never been quoted (quotedAt is null)", async () => {
    mockFindUniqueOrder.mockResolvedValue(quotedOrder({ quotedAt: null, paymentStatus: "PENDING_QUOTE" }));

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(409);
    expect(mockNotifyCustomerQuoteReady).not.toHaveBeenCalled();
  });

  it("resends successfully when paymentStatus has already moved past PENDING_QUOTE — the entire reason this route gates on quotedAt instead of status", async () => {
    mockFindUniqueOrder.mockResolvedValue(quotedOrder({ paymentStatus: "PENDING_VERIFICATION" }));
    mockNotifyCustomerQuoteReady.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(true);
  });

  it("never modifies order data — order.update is not called", async () => {
    mockFindUniqueOrder.mockResolvedValue(quotedOrder());
    mockNotifyCustomerQuoteReady.mockResolvedValue({ sent: true });

    await POST(buildRequest(), buildParams());

    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("still returns 200 with emailSent false when the resend fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueOrder.mockResolvedValue(quotedOrder());
    mockNotifyCustomerQuoteReady.mockResolvedValue({
      sent: false,
      error: "The abelkirar.com domain is not verified.",
    });

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(false);
    expect(body.emailError).toBe("The abelkirar.com domain is not verified.");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
