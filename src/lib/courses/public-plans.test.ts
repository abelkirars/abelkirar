import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { coursePlan: { findMany } } }));
import { getPublicCoursePlans } from "./public-plans";
const plan = { id: "plan", code: "BEGINNER_GROUP", level: "BEGINNER", format: "GROUP", monthlyPriceCents: 5000, currency: "USD", groupMinimumStudents: 3, groupMaximumStudents: 4, promotions: [] };
beforeEach(() => { findMany.mockReset(); });
it("selects only live server-dated promotions and uses integer server pricing", async () => {
  const now = new Date("2026-10-01T00:00:00Z");
  findMany.mockResolvedValue([{ ...plan, promotions: [{ id: "promotion", name: "Offer", discountType: "PERCENT", discountValue: 15, endsAt: new Date("2026-11-01T00:00:00Z"), publicCountdownEnabled: true }] }]);
  const [value] = await getPublicCoursePlans(now);
  expect(value).toMatchObject({ baseAmountCents: 5000, finalAmountCents: 4250, groupMaximumStudents: 4 });
  expect(findMany.mock.calls[0][0].include.promotions.where).toEqual({ enabled: true, cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } });
  expect(findMany.mock.calls[0][0].where).toEqual({ active: true, archivedAt: null });
});
it("uses base price without promotion and fails closed on ambiguous pricing", async () => {
  findMany.mockResolvedValue([plan]);
  expect((await getPublicCoursePlans())[0]).toMatchObject({ finalAmountCents: 5000, promotion: null });
  findMany.mockResolvedValue([{ ...plan, promotions: [{}, {}] }]);
  await expect(getPublicCoursePlans()).rejects.toThrow("Ambiguous");
});
