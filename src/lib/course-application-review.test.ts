import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const tx = {
  courseApplication: { findUnique: vi.fn(), updateMany: vi.fn() },
  coursePlan: { findFirst: vi.fn() },
  courseApplicationEvent: { create: vi.fn() },
};
const mockList = vi.fn();
const mockGet = vi.fn();
const mockTransaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
vi.mock("@/lib/db", () => ({
  prisma: {
    courseApplication: {
      findMany: (...args: unknown[]) => mockList(...args),
      findUnique: (...args: unknown[]) => mockGet(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...(args as [never])),
  },
}));

import {
  ApplicationDecisionConflictError,
  InvalidApplicationTransitionError,
  InvalidCoursePlanError,
  decideCourseApplication,
  getCourseApplicationReview,
  listCourseApplications,
} from "@/lib/course-application-review";

const pendingApplication = {
  id: "application-1",
  fullName: "Applicant",
  email: "applicant@example.com",
  locale: "en",
  isUnder15: false,
  guardianName: null,
  status: "PENDING",
  requestedLevel: "BEGINNER",
  requestedPlanId: null,
  requestedPlan: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.courseApplication.findUnique.mockResolvedValue(pendingApplication);
  tx.courseApplication.updateMany.mockResolvedValue({ count: 1 });
  tx.coursePlan.findFirst.mockResolvedValue({
    id: "plan-1",
    code: "BEGINNER_GROUP",
    level: "BEGINNER",
    format: "GROUP",
  });
  tx.courseApplicationEvent.create.mockResolvedValue({ id: "event-1" });
});

describe("application review reads", () => {
  it("retrieves pending applications with requested plan compatibility data", async () => {
    mockList.mockResolvedValue([]);
    await listCourseApplications("PENDING");
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "PENDING" } }));
  });

  it("retrieves a legacy application even when requestedPlanId is null", async () => {
    mockGet.mockResolvedValue({ ...pendingApplication, events: [] });
    const result = await getCourseApplicationReview("application-1");
    expect(result?.requestedPlanId).toBeNull();
  });
});

describe("decideCourseApplication", () => {
  it("approves with a server-validated active plan and creates an audit event", async () => {
    const result = await decideCourseApplication({
      applicationId: "application-1",
      adminId: "admin-1",
      decision: "APPROVE",
      coursePlanId: "plan-1",
    });

    expect(tx.coursePlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "plan-1", active: true, archivedAt: null }),
      })
    );
    expect(tx.courseApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "application-1", status: "PENDING" },
        data: expect.objectContaining({ status: "APPROVED", requestedPlanId: "plan-1" }),
      })
    );
    expect(tx.courseApplicationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: "application-1",
        fromStatus: "PENDING",
        toStatus: "APPROVED",
        actorAdminId: "admin-1",
      }),
    });
    expect(result.status).toBe("APPROVED");
  });

  it("rejects approval without an explicit plan for a legacy application", async () => {
    await expect(
      decideCourseApplication({
        applicationId: "application-1",
        adminId: "admin-1",
        decision: "APPROVE",
      })
    ).rejects.toBeInstanceOf(InvalidCoursePlanError);
    expect(tx.courseApplication.updateMany).not.toHaveBeenCalled();
  });

  it("rejects inactive, archived, unknown, or noncanonical plans", async () => {
    tx.coursePlan.findFirst.mockResolvedValue(null);
    await expect(
      decideCourseApplication({
        applicationId: "application-1",
        adminId: "admin-1",
        decision: "APPROVE",
        coursePlanId: "bad-plan",
      })
    ).rejects.toBeInstanceOf(InvalidCoursePlanError);
  });

  it("rejects a plan with an incompatible legacy requested level", async () => {
    tx.coursePlan.findFirst.mockResolvedValue({
      id: "plan-2",
      code: "INTERMEDIATE_GROUP",
      level: "INTERMEDIATE",
      format: "GROUP",
    });
    await expect(
      decideCourseApplication({
        applicationId: "application-1",
        adminId: "admin-1",
        decision: "APPROVE",
        coursePlanId: "plan-2",
      })
    ).rejects.toBeInstanceOf(InvalidCoursePlanError);
  });

  it.each([
    ["WAITLIST", "WAITLISTED"],
    ["DECLINE", "DECLINED"],
  ] as const)("applies a %s decision and audit event", async (decision, expectedStatus) => {
    await decideCourseApplication({
      applicationId: "application-1",
      adminId: "admin-1",
      decision,
      decisionReason: decision === "DECLINE" ? "Not a fit at this time" : undefined,
    });
    expect(tx.courseApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: expectedStatus }) })
    );
    expect(tx.courseApplicationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toStatus: expectedStatus }),
    });
  });

  it("rejects invalid terminal-state transitions", async () => {
    tx.courseApplication.findUnique.mockResolvedValue({
      ...pendingApplication,
      status: "APPROVED",
    });
    await expect(
      decideCourseApplication({
        applicationId: "application-1",
        adminId: "admin-1",
        decision: "DECLINE",
        decisionReason: "No",
      })
    ).rejects.toBeInstanceOf(InvalidApplicationTransitionError);
  });

  it("prevents duplicate/racing decisions with a conditional status update", async () => {
    tx.courseApplication.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      decideCourseApplication({
        applicationId: "application-1",
        adminId: "admin-1",
        decision: "WAITLIST",
      })
    ).rejects.toBeInstanceOf(ApplicationDecisionConflictError);
    expect(tx.courseApplicationEvent.create).not.toHaveBeenCalled();
  });

  it("does not create enrollment, payment, or portal-access records", async () => {
    await decideCourseApplication({
      applicationId: "application-1",
      adminId: "admin-1",
      decision: "APPROVE",
      coursePlanId: "plan-1",
    });
    expect(tx).not.toHaveProperty("courseEnrollment");
    expect(tx).not.toHaveProperty("coursePayment");
    expect(tx).not.toHaveProperty("coursePortalAccess");
  });
});
