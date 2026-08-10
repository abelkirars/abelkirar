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
const mockAttachCustomOrderImage = vi.fn();
// Same reasoning as src/app/api/orders/route.test.ts — full mock of
// @/lib/orders, not a partial importOriginal() one, to avoid importing the
// real src/lib/db.ts.
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
    attachCustomOrderImage: (...args: unknown[]) => mockAttachCustomOrderImage(...args),
    toCustomOrderNotificationData: (order: unknown) => order,
    OrderCreationError,
  };
});

const mockUploadCustomOrderImage = vi.fn();
vi.mock("@/lib/custom-order-images", () => ({
  uploadCustomOrderImage: (...args: unknown[]) => mockUploadCustomOrderImage(...args),
  ALLOWED_CUSTOM_ORDER_IMAGE_TYPES: new Set(["image/jpeg", "image/png", "image/webp"]),
  MAX_CUSTOM_ORDER_IMAGE_BYTES: 8 * 1024 * 1024,
}));

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

function buildRequest(fields: Record<string, string>, file?: File): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  if (file) formData.set("customOrderImage", file);
  return new Request("http://localhost/api/custom-orders", { method: "POST", body: formData });
}

// For the "not valid multipart" case only — a plain string body with no
// multipart boundary, same intent as the old JSON version's "not-json" body.
function buildRawRequest(body: string): Request {
  return new Request("http://localhost/api/custom-orders", { method: "POST", body });
}

const validFields = {
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
  customOrderDescription: validFields.description,
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

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(429);
    expect(mockCreateCustomOrder).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is not valid multipart form data", async () => {
    const res = await POST(buildRawRequest("not-multipart"));

    expect(res.status).toBe(400);
    expect(mockCreateCustomOrder).not.toHaveBeenCalled();
  });

  it("returns 400 with the zod message on a validation failure, and creates no order", async () => {
    const res = await POST(buildRequest({ ...validFields, description: "too short" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("enterCustomOrderDescription");
    expect(mockCreateCustomOrder).not.toHaveBeenCalled();
  });

  it("happy path with no image: response contains ONLY orderNumber, and no upload is attempted", async () => {
    mockCreateCustomOrder.mockResolvedValue(fakeCustomOrder);
    mockNotifyCustomerCustomOrderPending.mockResolvedValue({ sent: true });
    mockNotifyAdminNewCustomOrder.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(200);
    const body = await res.json();
    // toEqual (not objectContaining) — a future change that leaks total,
    // currency, paymentMethod, or an unwanted imageUploaded key into this
    // response fails here. Unchanged from before the image feature.
    expect(body).toEqual({ orderNumber: "ABK-20260810-CD34E" });
    expect(mockUploadCustomOrderImage).not.toHaveBeenCalled();
    expect(mockAttachCustomOrderImage).not.toHaveBeenCalled();
  });

  it("still returns 200 with the order created when the customer notification fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateCustomOrder.mockResolvedValue(fakeCustomOrder);
    mockNotifyCustomerCustomOrderPending.mockResolvedValue({ sent: false, error: "send failed" });
    mockNotifyAdminNewCustomOrder.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validFields));

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

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderNumber).toBe("ABK-20260810-CD34E");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns the OrderCreationError's own status and message, not a generic 500, and never attempts an upload", async () => {
    mockCreateCustomOrder.mockRejectedValue(
      new OrderCreationError("Product not found or not available for custom orders", 400)
    );

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Product not found or not available for custom orders");
    expect(mockUploadCustomOrderImage).not.toHaveBeenCalled();
  });

  it("rejects an unsupported image type with 400 and creates no order", async () => {
    const badFile = new File(["gif-bytes"], "photo.gif", { type: "image/gif" });

    const res = await POST(buildRequest(validFields, badFile));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Unsupported image type");
    expect(mockCreateCustomOrder).not.toHaveBeenCalled();
    expect(mockUploadCustomOrderImage).not.toHaveBeenCalled();
  });

  it("rejects an oversized image with 400 and creates no order", async () => {
    // Real bytes, not a patched .size — a File sent through an actual
    // Request/FormData body gets serialized to real bytes and re-parsed
    // into a brand-new File on the route side, so a spoofed size property
    // on the original object would be silently discarded in transit.
    const oversizedFile = new File([new Uint8Array(9 * 1024 * 1024)], "photo.png", {
      type: "image/png",
    });

    const res = await POST(buildRequest(validFields, oversizedFile));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Image is too large");
    expect(mockCreateCustomOrder).not.toHaveBeenCalled();
    expect(mockUploadCustomOrderImage).not.toHaveBeenCalled();
  });

  it("soft-fails when the upload throws for any other reason: order still created, imageUploaded false, error surfaced and logged", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const goodFile = new File(["real-image-bytes"], "photo.png", { type: "image/png" });
    mockCreateCustomOrder.mockResolvedValue(fakeCustomOrder);
    mockUploadCustomOrderImage.mockRejectedValue(new Error("network blip"));
    mockNotifyCustomerCustomOrderPending.mockResolvedValue({ sent: true });
    mockNotifyAdminNewCustomOrder.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validFields, goodFile));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderNumber).toBe("ABK-20260810-CD34E");
    expect(body.imageUploaded).toBe(false);
    expect(body.imageError).toBe("network blip");
    expect(mockAttachCustomOrderImage).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("happy path with a valid image: uploads, attaches the path, and the response is exact", async () => {
    const goodFile = new File(["real-image-bytes"], "photo.png", { type: "image/png" });
    mockCreateCustomOrder.mockResolvedValue(fakeCustomOrder);
    mockUploadCustomOrderImage.mockResolvedValue("orders/order-2/abc123.png");
    mockAttachCustomOrderImage.mockResolvedValue({});
    mockNotifyCustomerCustomOrderPending.mockResolvedValue({ sent: true });
    mockNotifyAdminNewCustomOrder.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validFields, goodFile));

    expect(res.status).toBe(200);
    const body = await res.json();
    // toEqual — same exactness intent as the no-image case, extended to
    // cover the one key a successful image upload is allowed to add.
    expect(body).toEqual({ orderNumber: "ABK-20260810-CD34E", imageUploaded: true });
    // Not toHaveBeenCalledWith("order-2", goodFile) — the File the route
    // receives is a fresh object reconstructed from the real Request body,
    // not the same instance (or exactly deep-equal — lastModified drifts
    // by construction) as the one built on the test side. Assert on the
    // properties that actually matter instead.
    expect(mockUploadCustomOrderImage).toHaveBeenCalledTimes(1);
    const [uploadedOrderId, uploadedFile] = mockUploadCustomOrderImage.mock.calls[0];
    expect(uploadedOrderId).toBe("order-2");
    expect(uploadedFile).toBeInstanceOf(File);
    expect(uploadedFile.name).toBe("photo.png");
    expect(uploadedFile.type).toBe("image/png");
    expect(mockAttachCustomOrderImage).toHaveBeenCalledWith("order-2", "orders/order-2/abc123.png");
  });
});
