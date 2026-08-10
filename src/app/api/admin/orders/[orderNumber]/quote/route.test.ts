import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueOrder = vi.fn();
const mockFindUniqueOrThrowOrder = vi.fn();
const mockUpdateOrder = vi.fn();
const mockUpdateManyOrderItem = vi.fn();
// Array-form $transaction: the route passes already-invoked Prisma promises
// (prisma.order.update(...), prisma.orderItem.updateMany(...)) into an
// array, not a callback. Promise.all(ops) is a faithful mock of that form —
// it proves "both statements ran with these args," not real transactional
// atomicity. Atomicity (rollback-on-failure) would need a live Postgres
// connection, which this machine cannot reach (see docs/PROJECT_STATE.md §14).
const mockTransaction = vi.fn((ops: unknown[]) => Promise.all(ops));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    order: {
      findUnique: (...args: unknown[]) => mockFindUniqueOrder(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrowOrder(...args),
      update: (...args: unknown[]) => mockUpdateOrder(...args),
    },
    orderItem: {
      updateMany: (...args: unknown[]) => mockUpdateManyOrderItem(...args),
    },
  },
}));

const mockNotifyCustomerQuoteReady = vi.fn();
const mockNotifyAdminQuoteSent = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyCustomerQuoteReady: (...args: unknown[]) => mockNotifyCustomerQuoteReady(...args),
    notifyAdminQuoteSent: (...args: unknown[]) => mockNotifyAdminQuoteSent(...args),
  },
}));

import { POST } from "@/app/api/admin/orders/[orderNumber]/quote/route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/orders/ABK-20260808-F5539/quote", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function buildParams(orderNumber = "ABK-20260808-F5539") {
  return { params: Promise.resolve({ orderNumber }) };
}

// Shape returned by the *initial* findUnique — the route only reads
// id/paymentStatus/paymentRegion off this before hitting the transaction.
const pendingQuoteOrder = {
  id: "order-1",
  orderNumber: "ABK-20260808-F5539",
  paymentStatus: "PENDING_QUOTE",
  paymentRegion: "US",
};

// Shape returned by the post-transaction findUniqueOrThrow — needs every
// field toNotificationData reads.
function requotedOrder(overrides: Record<string, unknown> = {}) {
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
    paymentStatus: "PENDING_VERIFICATION",
    status: "PENDING",
    createdAt: new Date("2026-08-08T00:00:00Z"),
    locale: "en",
    items: [{ productNameSnapshot: "Custom Kirar", quantity: 1, variantNameSnapshot: null }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  mockRequireAdminApi.mockResolvedValue({
    session: { adminId: "admin-1", displayName: "Admin User" },
  });
  mockUpdateOrder.mockResolvedValue({});
  mockUpdateManyOrderItem.mockResolvedValue({});
  mockNotifyAdminQuoteSent.mockResolvedValue({ sent: true });
});

describe("POST /api/admin/orders/[orderNumber]/quote", () => {
  it("rejects a non-admin caller before any DB call happens", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(buildRequest({ total: 200, paymentMethod: "ZELLE" }), buildParams());

    expect(res.status).toBe(401);
    expect(mockFindUniqueOrder).not.toHaveBeenCalled();
  });

  it("returns 404 when the order does not exist", async () => {
    mockFindUniqueOrder.mockResolvedValue(null);

    const res = await POST(buildRequest({ total: 200, paymentMethod: "ZELLE" }), buildParams());

    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects an order that is not PENDING_QUOTE with 409 and writes nothing", async () => {
    mockFindUniqueOrder.mockResolvedValue({ ...pendingQuoteOrder, paymentStatus: "PENDING_VERIFICATION" });

    const res = await POST(buildRequest({ total: 200, paymentMethod: "ZELLE" }), buildParams());

    expect(res.status).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects a total of 0 with 400 — pins zod's .positive()", async () => {
    mockFindUniqueOrder.mockResolvedValue(pendingQuoteOrder);

    const res = await POST(buildRequest({ total: 0, paymentMethod: "ZELLE" }), buildParams());

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects a negative total with 400 — pins zod's .positive()", async () => {
    mockFindUniqueOrder.mockResolvedValue(pendingQuoteOrder);

    const res = await POST(buildRequest({ total: -50, paymentMethod: "ZELLE" }), buildParams());

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects a US order with no paymentMethod — the region-pairing guard's actual reachable branch", async () => {
    mockFindUniqueOrder.mockResolvedValue(pendingQuoteOrder);

    const res = await POST(buildRequest({ total: 200 }), buildParams());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/select zelle or cash app/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects paymentMethod EUR_BANK_TRANSFER with 400 — via zod's enum, since quoteSchema doesn't accept this value at all; the region guard's 'wrong method for US' branch is unreachable through this schema", async () => {
    mockFindUniqueOrder.mockResolvedValue(pendingQuoteOrder);

    const res = await POST(
      buildRequest({ total: 200, paymentMethod: "EUR_BANK_TRANSFER" }),
      buildParams()
    );

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("forces paymentMethod to EUR_BANK_TRANSFER for a EUROZONE order even when the client sends ZELLE", async () => {
    mockFindUniqueOrder.mockResolvedValue({ ...pendingQuoteOrder, paymentRegion: "EUROZONE" });
    mockFindUniqueOrThrowOrder.mockResolvedValue(
      requotedOrder({ paymentRegion: "EUROZONE", paymentMethod: "EUR_BANK_TRANSFER" })
    );
    mockNotifyCustomerQuoteReady.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest({ total: 200, paymentMethod: "ZELLE" }), buildParams());

    expect(res.status).toBe(200);
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentMethod: "EUR_BANK_TRANSFER" }),
      })
    );
  });

  it("happy path: updates the order, updates the order item, sets quotedAt/quotedById, and notifies the customer", async () => {
    mockFindUniqueOrder.mockResolvedValue(pendingQuoteOrder);
    mockFindUniqueOrThrowOrder.mockResolvedValue(requotedOrder());
    mockNotifyCustomerQuoteReady.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest({ total: 200, paymentMethod: "ZELLE" }), buildParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(true);
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1" },
        data: expect.objectContaining({
          subtotal: 20000,
          total: 20000,
          paymentMethod: "ZELLE",
          paymentStatus: "PENDING_VERIFICATION",
          quotedAt: expect.any(Date),
          quotedById: "admin-1",
        }),
      })
    );
    // The write that fixes the zero-price item row — easy to regress since
    // it's a second, separate statement from the order update above.
    expect(mockUpdateManyOrderItem).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
      data: { unitPrice: 20000 },
    });
    // The admin list gets told too, with the acting admin's display name.
    expect(mockNotifyAdminQuoteSent).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: "ABK-20260808-F5539" }),
      "Admin User"
    );
  });

  it("converts dollars to cents: 200.50 becomes 20050", async () => {
    mockFindUniqueOrder.mockResolvedValue(pendingQuoteOrder);
    mockFindUniqueOrThrowOrder.mockResolvedValue(requotedOrder({ subtotal: 20050, total: 20050 }));
    mockNotifyCustomerQuoteReady.mockResolvedValue({ sent: true });

    await POST(buildRequest({ total: 200.5, paymentMethod: "ZELLE" }), buildParams());

    expect(mockUpdateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subtotal: 20050, total: 20050 }) })
    );
  });

  it("still returns 200 with emailSent false when the quote email fails — the price must stay saved", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueOrder.mockResolvedValue(pendingQuoteOrder);
    mockFindUniqueOrThrowOrder.mockResolvedValue(requotedOrder());
    mockNotifyCustomerQuoteReady.mockResolvedValue({
      sent: false,
      error: "The abelkirar.com domain is not verified.",
    });

    const res = await POST(buildRequest({ total: 200, paymentMethod: "ZELLE" }), buildParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(false);
    expect(body.emailError).toBe("The abelkirar.com domain is not verified.");
    // The write already happened before the email was attempted.
    expect(mockUpdateOrder).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    // The admin notification is independent of the customer email's outcome
    // — it still fires even though the customer send above failed.
    expect(mockNotifyAdminQuoteSent).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
