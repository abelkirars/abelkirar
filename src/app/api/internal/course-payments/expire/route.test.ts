import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/courses/expiration-job", () => ({ runInitialPaymentExpirationJob: run }));
import { GET, HEAD } from "./route";
// Fixed, deliberately non-live test fixture. Never written to any env file.
const testSecret = "fixture-only-not-a-live-scheduler-secret";
function request(auth?: string, query = "") {
  return new Request(`https://example.invalid/api/internal/course-payments/expire${query}`, { headers: auth ? { authorization: auth } : {} });
}
describe("scheduler endpoint authorization", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", testSecret); run.mockResolvedValue({ failed: 0, expired: 1 }); });
  afterEach(() => vi.unstubAllEnvs());
  it.each([undefined, "Bearer incorrect", "Basic admin", `bearer ${testSecret}`])("denies invalid authorization %s without DB access", async auth => {
    expect((await GET(request(auth))).status).toBe(401); expect(run).not.toHaveBeenCalled();
  });
  it.each(["", "short"])("fails closed with absent/weak server configuration", async value => {
    vi.stubEnv("CRON_SECRET", value);
    expect((await GET(request(`Bearer ${value}`))).status).toBe(401);
  });
  it("permits only the scheduler bearer secret and never returns it", async () => {
    const response = await GET(request(`Bearer ${testSecret}`));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).not.toContain(testSecret); expect(run).toHaveBeenCalledOnce();
  });
  it("ignores customer/admin cookies as scheduler credentials", async () => {
    const req = request(); req.headers.set("cookie", "admin-session=fixture; customer-session=fixture");
    expect((await GET(req)).status).toBe(401); expect(run).not.toHaveBeenCalled();
  });
  it("rejects arbitrary targets/clocks and HEAD cannot run a job", async () => {
    expect((await GET(request(`Bearer ${testSecret}`, "?paymentId=another"))).status).toBe(400);
    expect(HEAD().status).toBe(405); expect(run).not.toHaveBeenCalled();
  });
  it("signals record and infrastructure failures without raw error content", async () => {
    run.mockResolvedValue({ failed: 1 }); expect((await GET(request(`Bearer ${testSecret}`))).status).toBe(503);
    run.mockRejectedValue(new Error("sensitive detail"));
    const response = await GET(request(`Bearer ${testSecret}`));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("sensitive");
  });
});
