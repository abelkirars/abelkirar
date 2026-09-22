import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), proof: vi.fn() }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: mocks.auth }));
vi.mock("@/lib/courses/admin-payments", () => ({ getAdminCourseProofUrl: mocks.proof }));
import { GET } from "./route";
const context = { params: Promise.resolve({ paymentId: "payment", submissionId: "proof" }) };
const request = (query = "") => new Request(`https://example.invalid/api/admin/course-payments/payment/proof/proof${query}`);
describe("private proof route", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ adminId: "admin" }); });
  it("does not look up proof for non-admin", async () => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await GET(request(), context)).status).toBe(401); expect(mocks.proof).not.toHaveBeenCalled();
  });
  it("rejects arbitrary client paths", async () => {
    expect((await GET(request("?path=other/file.pdf"), context)).status).toBe(400);
    expect(mocks.proof).not.toHaveBeenCalled();
  });
  it("missing association is not found", async () => {
    mocks.proof.mockResolvedValue(null); expect((await GET(request(), context)).status).toBe(404);
  });
  it("redirects with no cache/referrer and passes only record IDs", async () => {
    mocks.proof.mockResolvedValue("https://example.invalid/signed-download");
    const response = await GET(request(), context);
    expect(response.status).toBe(307); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(mocks.proof).toHaveBeenCalledWith("payment", "proof");
  });
});
