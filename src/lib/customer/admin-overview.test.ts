import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn(), customer: vi.fn(), payments: vi.fn(), courseSum: vi.fn(), storeSum: vi.fn() }));
vi.mock("@/lib/courses/admin-service", () => ({ courseAdmin: mocks.admin }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findUnique: mocks.customer }, coursePayment: { findMany: mocks.payments, groupBy: mocks.courseSum }, order: { groupBy: mocks.storeSum } } }));
import { getAdminCustomerOverview } from "./admin-overview";
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ adminId: "admin" }); mocks.customer.mockResolvedValue({ id: "customer" }); for (const query of [mocks.payments, mocks.courseSum, mocks.storeSum]) query.mockResolvedValue([]); });
it("checks admin before any read", async () => {
  mocks.admin.mockRejectedValue(new Error("denied"));
  await expect(getAdminCustomerOverview("customer")).rejects.toThrow("denied");
  expect(mocks.customer).not.toHaveBeenCalled();
});
it("uses explicit IDs and verified, untruncated currency-grouped totals", async () => {
  await getAdminCustomerOverview("customer");
  expect(mocks.customer.mock.calls[0][0].where).toEqual({ id: "customer" });
  expect(mocks.payments.mock.calls[0][0].where).toEqual({ enrollment: { customerId: "customer" } });
  expect(mocks.courseSum.mock.calls[0][0]).toEqual({ by: ["currency"], where: { enrollment: { customerId: "customer" }, status: "VERIFIED", verifiedAt: { not: null } }, _sum: { finalAmountCents: true } });
  expect(mocks.storeSum.mock.calls[0][0].where).toEqual({ customerId: "customer", paymentStatus: "PAID", paymentConfirmedAt: { not: null } });
});
