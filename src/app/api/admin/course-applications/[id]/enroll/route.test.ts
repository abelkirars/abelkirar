import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: mocks.auth }));
vi.mock("@/lib/courses/create-enrollment", () => ({ createEnrollmentAndInitialPayment: mocks.create }));
vi.mock("@/lib/courses/admin-response", () => ({ preparationErrorResponse: () => Response.json({ error: "Failed" }, { status: 409 }) }));

import { POST } from "./route";

const result = { idempotent: false, payment: { id: "payment" } };
const context = { params: Promise.resolve({ id: "application" }) };
const request = () => new Request("https://example.invalid/api/admin/course-applications/application/enroll", { method: "POST", body: "{}" });

describe("payment-required durable notification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ session: { adminId: "admin" } });
    mocks.create.mockResolvedValue(result);
  });

  it("returns only after the service commits its financial state and outbox row", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result });
    expect(mocks.create).toHaveBeenCalledWith("application", {});
  });

  it("does not report success when the transactional service fails", async () => {
    mocks.create.mockRejectedValue(new Error("No commit"));
    expect((await POST(request(), context)).status).toBe(409);
  });
});
