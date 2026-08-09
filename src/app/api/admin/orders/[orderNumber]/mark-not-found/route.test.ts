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

const mockNotifyAdminPaymentNotFound = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyAdminPaymentNotFound: (...args: unknown[]) => mockNotifyAdminPaymentNotFound(...args),
  },
}));

import { POST } from "@/app/api/admin/orders/[orderNumber]/mark-not-found/route";

function buildRequest(): Request {
  return new Request("http://localhost/api/admin/orders/ABK-20260808-F5539/mark-not-found", {
    method: "POST",
  });
}

function buildParams(orderNumber = "ABK-20260808-F5539") {
  return { params: Promise.resolve({ orderNumber }) };
}

const baseOrder = {
  id: "order-1",
  orderNumber: "ABK-20260808-F5539",
  paymentStatus: "PENDING_VERIFICATION",
  status: "PENDING",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+15555550100",
  subtotal: 10000,
  total: 10000,
  currency: "usd",
  paymentMethod: "ZELLE",
  paymentRegion: "US",
  createdAt: new Date("2026-08-08T00:00:00Z"),
  locale: "en",
  items: [{ productNameSnapshot: "Kirar Standard", quantity: 1, variantNameSnapshot: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
});

describe("POST /api/admin/orders/[orderNumber]/mark-not-found", () => {
  it("rejects a non-admin caller before any DB call happens", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(401);
    expect(mockFindUniqueOrder).not.toHaveBeenCalled();
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("returns 404 when the order does not exist", async () => {
    mockFindUniqueOrder.mockResolvedValue(null);

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(404);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("rejects a PENDING_QUOTE order with 409 and never calls update — regression test for commit 1a42e59", async () => {
    mockFindUniqueOrder.mockResolvedValue({
      ...baseOrder,
      paymentStatus: "PENDING_QUOTE",
      subtotal: 0,
      total: 0,
    });

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/awaiting a quote/i);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("rejects an already-PAID order with 409", async () => {
    mockFindUniqueOrder.mockResolvedValue({ ...baseOrder, paymentStatus: "PAID" });

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(409);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("marks the order PAYMENT_NOT_FOUND and notifies admin on the happy path", async () => {
    mockFindUniqueOrder.mockResolvedValue(baseOrder);
    mockUpdateOrder.mockResolvedValue({ ...baseOrder, paymentStatus: "PAYMENT_NOT_FOUND" });
    mockNotifyAdminPaymentNotFound.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(), buildParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseOrder.id },
        data: { paymentStatus: "PAYMENT_NOT_FOUND" },
      })
    );
    expect(mockNotifyAdminPaymentNotFound).toHaveBeenCalledTimes(1);
  });
});
