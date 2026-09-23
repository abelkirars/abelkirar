import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), user: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.client }));
import { GET, HEAD } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchange, getUser: mocks.user } });
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.user.mockResolvedValue({ data: { user: { id: "test-user", email: "test@example.invalid", email_confirmed_at: "2026-09-01T00:00:00Z" } }, error: null });
});
it("accepts only a server-confirmed Supabase email after PKCE exchange", async () => {
  const response = await GET(new Request("https://academy.invalid/account/confirm?code=test-code&next=https://attacker.invalid"));
  expect(mocks.exchange).toHaveBeenCalledWith("test-code");
  expect(mocks.user).toHaveBeenCalledOnce();
  expect(response.headers.get("location")).toBe("https://academy.invalid/account");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
it.each([null, { email: "test@example.invalid" }, { email: "test@example.invalid", email_confirmed_at: "invalid" }])("never trusts an unverified user %j", async user => {
  mocks.user.mockResolvedValue({ data: { user }, error: null });
  expect((await GET(new Request("https://academy.invalid/account/confirm?code=test-code"))).headers.get("location")).toBe("https://academy.invalid/account/login?confirmation=failed");
});
it("does not exchange missing or oversized codes", async () => {
  await GET(new Request("https://academy.invalid/account/confirm"));
  await GET(new Request(`https://academy.invalid/account/confirm?code=${"x".repeat(2049)}`));
  expect(mocks.client).not.toHaveBeenCalled();
});
it("returns a generic failure for invalid PKCE or provider failures", async () => {
  mocks.exchange.mockResolvedValue({ error: { message: "private provider details" } });
  const response = await GET(new Request("https://academy.invalid/account/confirm?code=test-code"));
  expect(response.headers.get("location")).toBe("https://academy.invalid/account/login?confirmation=failed");
  expect(mocks.user).not.toHaveBeenCalled();
});
it("HEAD cannot trigger a session exchange", () => {
  expect(HEAD().status).toBe(405);
  expect(mocks.client).not.toHaveBeenCalled();
});
