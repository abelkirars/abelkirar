import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: () => mockRequireAdminApi() }));

const mockDecide = vi.fn();
vi.mock("@/lib/course-application-review", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/course-application-review")>();
  return { ...original, decideCourseApplication: (...args: unknown[]) => mockDecide(...args) };
});

const mockNotify = vi.fn();
vi.mock("@/lib/notifications/course-application-decision", () => ({
  notifyApplicantOfCourseApplicationDecision: (...args: unknown[]) => mockNotify(...args),
}));

import { ApplicationDecisionConflictError } from "@/lib/course-application-review";
import { POST } from "@/app/api/admin/course-applications/[id]/decision/route";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/course-applications/application-1/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "application-1" }) };
const decisionResult = {
  applicationId: "application-1",
  fullName: "Applicant",
  email: "applicant@example.com",
  locale: "en",
  isUnder15: false,
  guardianName: null,
  status: "APPROVED",
  decisionReason: null,
  coursePlanCode: "BEGINNER_GROUP",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
  mockDecide.mockResolvedValue(decisionResult);
  mockNotify.mockResolvedValue({ sent: true });
});

describe("POST application decision", () => {
  it("rejects unauthenticated callers before the service or email runs", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const response = await POST(request({ decision: "WAITLIST" }), params);
    expect(response.status).toBe(401);
    expect(mockDecide).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("passes only the authenticated admin identity to the decision service", async () => {
    const response = await POST(
      request({ decision: "APPROVE", coursePlanId: "plan-1", adminId: "attacker" }),
      params
    );
    expect(response.status).toBe(200);
    expect(mockDecide).toHaveBeenCalledWith({
      applicationId: "application-1",
      adminId: "admin-1",
      decision: "APPROVE",
      coursePlanId: "plan-1",
    });
  });

  it("does not send a duplicate email when a racing decision loses", async () => {
    mockDecide.mockRejectedValue(new ApplicationDecisionConflictError("Changed"));
    const response = await POST(request({ decision: "WAITLIST" }), params);
    expect(response.status).toBe(409);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("keeps the successful decision when email delivery fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockNotify.mockResolvedValue({ sent: false, error: "Email unavailable" });
    const response = await POST(
      request({ decision: "APPROVE", coursePlanId: "plan-1" }),
      params
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      notification: { sent: false },
    });
    expect(mockDecide).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("requires a public reason for decline", async () => {
    const response = await POST(request({ decision: "DECLINE" }), params);
    expect(response.status).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });
});
