import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ identity: vi.fn(), relations: vi.fn(), enrollments: vi.fn(), orders: vi.fn() }));
vi.mock("./dal", () => ({ getOrCreateCurrentCustomer: mocks.identity }));
vi.mock("@/lib/courses/course-payment-access", () => ({ CoursePaymentCustomerDeniedError: class extends Error {} }));
vi.mock("@/lib/db", () => ({ prisma: { customerStudentRelation: { findMany: mocks.relations }, courseEnrollment: { findMany: mocks.enrollments }, order: { findMany: mocks.orders } } }));
import { getCurrentAccountOverview } from "./account";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ id: "payer-a", status: "ACTIVE", archivedAt: null, deactivatedAt: null, email: "payer@example.invalid" });
  for (const query of [mocks.relations, mocks.enrollments, mocks.orders]) query.mockResolvedValue([]);
});
it("scopes every read to authenticated payer; never joins orders by email", async () => {
  await getCurrentAccountOverview();
  expect(mocks.orders.mock.calls[0][0].where).toEqual({ customerId: "payer-a" });
  expect(mocks.enrollments.mock.calls[0][0].where).toEqual({ customerId: "payer-a" });
  expect(mocks.relations.mock.calls[0][0].where).toEqual({ customerId: "payer-a", type: "GUARDIAN", endedAt: null, archivedAt: null });
  expect(mocks.relations.mock.calls[0][0].select.student.select).toEqual({ id: true, fullName: true });
});
it.each([{ status: "INACTIVE" }, { archivedAt: new Date() }, { deactivatedAt: new Date() }])("denies inactive account before reading records %j", async override => {
  mocks.identity.mockResolvedValue({ id: "payer-a", status: "ACTIVE", ...override });
  await expect(getCurrentAccountOverview()).rejects.toThrow("Account unavailable");
  expect(mocks.orders).not.toHaveBeenCalled();
  expect(mocks.relations).not.toHaveBeenCalled();
});
