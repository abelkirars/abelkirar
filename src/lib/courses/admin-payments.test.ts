import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn(), find: vi.fn(), sign: vi.fn() }));
vi.mock("./admin-service", () => ({ courseAdmin: mocks.admin }));
vi.mock("@/lib/db", () => ({ prisma: { coursePaymentSubmission: { findFirst: mocks.find } } }));
vi.mock("@/lib/payment-screenshots", () => ({ getPaymentScreenshotSignedUrl: mocks.sign }));
import { getAdminCourseProofUrl, paymentQueueFilter } from "./admin-payments";

describe("private admin course proofs", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ adminId: "admin" }); });
  it("authorizes before database lookup or signing", async () => {
    mocks.admin.mockRejectedValue(new Error("Unauthorized"));
    await expect(getAdminCourseProofUrl("payment", "proof")).rejects.toThrow("Unauthorized");
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("signs only the associated DB path, for 60 seconds, as a download", async () => {
    const path = "course-payments/payment/proof/evidence.pdf";
    mocks.find.mockResolvedValue({ proofStoragePath: path }); mocks.sign.mockResolvedValue("https://example.invalid/signed");
    await expect(getAdminCourseProofUrl("payment", "proof")).resolves.toBe("https://example.invalid/signed");
    expect(mocks.find).toHaveBeenCalledWith({ where: { id: "proof", paymentId: "payment" }, select: { proofStoragePath: true } });
    expect(mocks.sign).toHaveBeenCalledWith(path, 60, true);
  });
  it.each([null, { proofStoragePath: "course-payments/another/proof/file.png" }])("does not sign missing/wrong association %s", async record => {
    mocks.find.mockResolvedValue(record);
    expect(await getAdminCourseProofUrl("payment", "proof")).toBeNull();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("defaults to proof queue and never invents a REJECTED payment state", () => {
    expect(paymentQueueFilter()).toBe("PROOF_SUBMITTED");
    expect(paymentQueueFilter("REJECTED")).toBe("PROOF_SUBMITTED");
    expect(paymentQueueFilter("EXPIRED")).toBe("EXPIRED");
  });
});
