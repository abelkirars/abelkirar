import { beforeEach, expect, it, vi } from "vitest";
import { readMyLessonSchedules } from "./lesson-schedule-views";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), enrollment: vi.fn(), slots: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  courseEnrollment: { findMany: mocks.list, findFirst: mocks.enrollment },
  courseLessonScheduleSlot: { findMany: mocks.slots },
} }));
vi.mock("@/lib/student/dal", () => ({ resolveStudentSession: mocks.session }));
vi.mock("@/lib/customer/dal", () => ({ getCurrentAuthenticatedCustomer: vi.fn() }));
vi.mock("./admin-service", () => ({ courseAdmin: vi.fn(), serializable: vi.fn() }));

type Enrollment = {
  id: string; studentId: string; status: string; archivedAt: Date | null;
  cohortId: null; portalAccess: { status: string; archivedAt: Date | null } | null;
};
let rows: Enrollment[];
beforeEach(() => {
  vi.resetAllMocks();
  rows = ["changed", "still-valid"].map(id => ({
    id, studentId: "own-learner", status: "ACTIVE", archivedAt: null, cohortId: null,
    portalAccess: { status: "ENABLED", archivedAt: null },
  }));
  mocks.session.mockResolvedValue({ kind: "active", session: { studentId: "own-learner" } });
  mocks.list.mockResolvedValue(rows.map(e => ({ id: e.id, planCodeSnapshot: "BEGINNER_ONE_TO_ONE", cohort: null })));
  // Exercise the real secondary reader, including its ownership and eligibility filter.
  mocks.enrollment.mockImplementation(async ({ where }) => {
    expect(where).toMatchObject({ studentId: "own-learner", status: "ACTIVE", archivedAt: null,
      portalAccess: { is: { status: "ENABLED", archivedAt: null } } });
    return rows.find(e => e.id === where.id && e.studentId === where.studentId && e.status === where.status
      && e.archivedAt === null && e.portalAccess?.status === "ENABLED" && e.portalAccess.archivedAt === null) ?? null;
  });
  mocks.slots.mockResolvedValue([1, 2].map(ordinal => ({
    ordinal, weekday: ordinal === 1 ? "TUESDAY" : "THURSDAY", localStartMinute: 600,
    durationMinutes: 60, timeZone: "America/Chicago", effectiveStartDate: new Date("2026-10-01T00:00:00Z"), effectiveEndDate: null,
  })));
});

it.each(["CANCELLED", "PAUSED", "PENDING_PAYMENT", "COMPLETED"])("omits an enrollment that becomes %s after the initial ACTIVE query, retaining another valid schedule", async status => {
  mocks.list.mockImplementationOnce(async ({ where }) => {
    expect(rows[0].status).toBe("ACTIVE");
    expect(where).toMatchObject({ studentId: "own-learner", status: "ACTIVE", archivedAt: null,
      portalAccess: { is: { status: "ENABLED", archivedAt: null } } });
    const initial = rows.map(e => ({ id: e.id, planCodeSnapshot: "BEGINNER_ONE_TO_ONE", cohort: null }));
    rows[0].status = status; // Deterministic inter-read transition, not a timed race.
    return initial;
  });
  expect(await readMyLessonSchedules()).toMatchObject([{ enrollmentId: "still-valid", slots: [{ ordinal: 1 }, { ordinal: 2 }] }]);
  expect(mocks.enrollment).toHaveBeenCalledTimes(2);
  expect(mocks.slots).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { enrollmentId: "still-valid", archivedAt: null, state: "PUBLISHED" } }));
});

it.each(["SUSPENDED", "REVOKED"])("does not render a schedule when access becomes %s between reads", async status => {
  rows[0].portalAccess!.status = status;
  expect(await readMyLessonSchedules()).toMatchObject([{ enrollmentId: "still-valid" }]);
  expect(mocks.slots).toHaveBeenCalledTimes(1);
});
it.each(["missing-access", "archived-access", "archived-enrollment", "other-learner"])("preserves eligibility and learner isolation for %s", async condition => {
  if (condition === "missing-access") rows[0].portalAccess = null;
  if (condition === "archived-access") rows[0].portalAccess!.archivedAt = new Date();
  if (condition === "archived-enrollment") rows[0].archivedAt = new Date();
  if (condition === "other-learner") rows[0].studentId = "another-learner";
  expect(await readMyLessonSchedules()).toMatchObject([{ enrollmentId: "still-valid" }]);
  expect(mocks.slots).toHaveBeenCalledTimes(1);
});
it("rejects initial portal denial before querying enrollments", async () => {
  mocks.session.mockResolvedValue({ kind: "portal-denied" });
  await expect(readMyLessonSchedules()).rejects.toThrow("Student portal access required");
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.slots).not.toHaveBeenCalled();
});
it("does not swallow a secondary authentication/access failure", async () => {
  mocks.session.mockResolvedValueOnce({ kind: "active", session: { studentId: "own-learner" } }).mockResolvedValue({ kind: "portal-denied" });
  await expect(readMyLessonSchedules()).rejects.toThrow("Student portal access required");
  expect(mocks.enrollment).not.toHaveBeenCalled(); expect(mocks.slots).not.toHaveBeenCalled();
});
it.each([new Error("unexpected database failure"), new Error("Enrollment not found")])("does not swallow an untyped secondary DB/programming failure: %s", async error => {
  mocks.enrollment.mockRejectedValueOnce(error);
  await expect(readMyLessonSchedules()).rejects.toBe(error);
  expect(mocks.slots).not.toHaveBeenCalled();
});
it("does not swallow an initial query failure", async () => {
  const error = new Error("database unavailable"); mocks.list.mockRejectedValueOnce(error);
  await expect(readMyLessonSchedules()).rejects.toBe(error);
  expect(mocks.enrollment).not.toHaveBeenCalled();
});
it("does not swallow an incomplete published schedule failure", async () => {
  mocks.slots.mockResolvedValueOnce([{ ordinal: 1 }]);
  await expect(readMyLessonSchedules()).rejects.toThrow("Incomplete published schedule");
});
