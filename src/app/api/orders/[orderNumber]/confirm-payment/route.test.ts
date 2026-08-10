import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  clientIpFrom: (request: Request) => request.headers.get("x-forwarded-for") ?? "unknown",
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const mockFindUniqueOrder = vi.fn();
const mockCreatePaymentConfirmation = vi.fn();
// @/lib/db is mocked here regardless (for order.findUnique / paymentConfirmation.create),
// so the real @/lib/orders.ts is safe to import unmocked below — its own
// `import { prisma } from "@/lib/db"` resolves to this same mock. No
// separate importOriginal workaround needed (contrast Tier 3's route tests,
// which mocked @/lib/db instead and so had to fully mock @/lib/orders).
vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => mockFindUniqueOrder(...args),
    },
    paymentConfirmation: {
      create: (...args: unknown[]) => mockCreatePaymentConfirmation(...args),
    },
  },
}));

const mockUploadPaymentScreenshot = vi.fn();
vi.mock("@/lib/payment-screenshots", () => {
  class InvalidScreenshotError extends Error {}
  return {
    uploadPaymentScreenshot: (...args: unknown[]) => mockUploadPaymentScreenshot(...args),
    InvalidScreenshotError,
  };
});

const mockNotifyAdminPaymentSubmitted = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyAdminPaymentSubmitted: (...args: unknown[]) => mockNotifyAdminPaymentSubmitted(...args),
  },
}));

import { POST } from "@/app/api/orders/[orderNumber]/confirm-payment/route";
import { InvalidScreenshotError } from "@/lib/payment-screenshots";

function buildRequest(fields: Record<string, string>, screenshot?: File): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  if (screenshot) formData.set("screenshot", screenshot);
  return new Request("http://localhost/api/orders/ABK-20260808-F5539/confirm-payment", {
    method: "POST",
    body: formData,
  });
}

function buildParams(orderNumber = "ABK-20260808-F5539") {
  return { params: Promise.resolve({ orderNumber }) };
}

const validFields = {
  senderName: "Jane Doe",
  amountSent: "150.00",
  sentAt: "2026-08-09T12:00:00Z",
};

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
  mockCheckRateLimit.mockResolvedValue(true);
});

describe("POST /api/orders/[orderNumber]/confirm-payment", () => {
  it("returns 429 and writes nothing when the rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue(false);

    const res = await POST(buildRequest(validFields), buildParams());

    expect(res.status).toBe(429);
    expect(mockFindUniqueOrder).not.toHaveBeenCalled();
    expect(mockCreatePaymentConfirmation).not.toHaveBeenCalled();
  });

  it("returns 404 when the order does not exist", async () => {
    mockFindUniqueOrder.mockResolvedValue(null);

    const res = await POST(buildRequest(validFields), buildParams());

    expect(res.status).toBe(404);
    expect(mockCreatePaymentConfirmation).not.toHaveBeenCalled();
  });

  it("rejects a PENDING_QUOTE order and never creates a PaymentConfirmation or attempts a screenshot upload", async () => {
    mockFindUniqueOrder.mockResolvedValue({
      ...baseOrder,
      paymentStatus: "PENDING_QUOTE",
      subtotal: 0,
      total: 0,
    });
    const screenshot = new File(["fake-image-bytes"], "proof.png", { type: "image/png" });

    const res = await POST(buildRequest(validFields, screenshot), buildParams());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/awaiting a quote/i);
    expect(mockUploadPaymentScreenshot).not.toHaveBeenCalled();
    expect(mockCreatePaymentConfirmation).not.toHaveBeenCalled();
  });

  it("rejects an already-PAID order with the existing guard's 409", async () => {
    mockFindUniqueOrder.mockResolvedValue({ ...baseOrder, paymentStatus: "PAID" });

    const res = await POST(buildRequest(validFields), buildParams());

    expect(res.status).toBe(409);
    expect(mockCreatePaymentConfirmation).not.toHaveBeenCalled();
  });

  it("returns 400 on a validation failure and creates no row", async () => {
    mockFindUniqueOrder.mockResolvedValue(baseOrder);

    const res = await POST(buildRequest({ ...validFields, senderName: "" }), buildParams());

    expect(res.status).toBe(400);
    expect(mockCreatePaymentConfirmation).not.toHaveBeenCalled();
  });

  it("happy path: creates the PaymentConfirmation with the right fields and notifies admin", async () => {
    mockFindUniqueOrder.mockResolvedValue(baseOrder);
    mockCreatePaymentConfirmation.mockResolvedValue({});
    mockNotifyAdminPaymentSubmitted.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validFields), buildParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockCreatePaymentConfirmation).toHaveBeenCalledWith({
      data: {
        orderId: "order-1",
        senderName: "Jane Doe",
        amountSent: 15000,
        sentAt: new Date("2026-08-09T12:00:00Z"),
        transactionReference: undefined,
        screenshotPath: null,
      },
    });
    expect(mockNotifyAdminPaymentSubmitted).toHaveBeenCalledTimes(1);
  });

  it("returns 400 and writes no row when the screenshot is rejected as invalid (wrong type or too large)", async () => {
    mockFindUniqueOrder.mockResolvedValue(baseOrder);
    mockUploadPaymentScreenshot.mockRejectedValue(new InvalidScreenshotError("Unsupported image type"));
    const screenshot = new File(["fake-heic-bytes"], "proof.heic", { type: "image/heic" });

    const res = await POST(buildRequest(validFields, screenshot), buildParams());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Unsupported image type");
    expect(mockCreatePaymentConfirmation).not.toHaveBeenCalled();
  });

  it("fails the whole request with 500 and writes no row when the screenshot upload throws for any other reason", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueOrder.mockResolvedValue(baseOrder);
    mockUploadPaymentScreenshot.mockRejectedValue(new Error("network blip"));
    const screenshot = new File(["fake-image-bytes"], "proof.png", { type: "image/png" });

    const res = await POST(buildRequest(validFields, screenshot), buildParams());

    expect(res.status).toBe(500);
    expect(mockCreatePaymentConfirmation).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("still returns 200 with the row saved when the admin notification fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueOrder.mockResolvedValue(baseOrder);
    mockCreatePaymentConfirmation.mockResolvedValue({});
    mockNotifyAdminPaymentSubmitted.mockResolvedValue({ sent: false, error: "send failed" });

    const res = await POST(buildRequest(validFields), buildParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockCreatePaymentConfirmation).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
