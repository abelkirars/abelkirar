import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), cookies: vi.fn(), findCustomer: vi.fn(),
  create: vi.fn(), update: vi.fn(), notify: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: mocks.cookies }) }));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
// No real DB, Auth, rate-limit store or email service is reachable. Unexpected
// model access throws; the real route, identity resolver and creation service
// run together, so extra business writes cannot hide behind a service mock.
vi.mock("@/lib/db", () => ({ prisma: new Proxy({
  customer: { findUnique: mocks.findCustomer },
  courseApplication: { create: mocks.create, update: mocks.update },
}, { get(target, property) {
  if (!(property in target)) throw new Error("Unexpected business model access");
  return Reflect.get(target, property);
} }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true, clientIpFrom: () => "test" }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "en" }));
vi.mock("@/lib/notifications/course-application-notifications", () => ({ sendCourseApplicationNotifications: mocks.notify }));

import { POST } from "./route";

const authId = "11111111-1111-4111-8111-111111111111";
const user = { id: authId, email: "payer@example.invalid", email_confirmed_at: "2026-09-20T10:00:00Z" };
const customer = { id: "customer-payer", status: "ACTIVE", archivedAt: null, deactivatedAt: null };
const input = {
  fullName: "Learner", country: "Ethiopia", isUnder15: false,
  email: "different-contact@example.invalid", lessonLanguage: "EN",
  requestedLevel: "BEGINNER", kirarModel: "NONE_YET",
};
function request(body: unknown = input, headers: Record<string, string> = { origin: "https://academy.invalid" }) {
  return new Request("https://academy.invalid/api/course-applications", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}
function guest() {
  mocks.cookies.mockReturnValue([]);
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.mockReturnValue([{ name: "sb-test-auth-token.0", value: "never-trusted" }]);
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.findCustomer.mockResolvedValue(customer);
  mocks.create.mockImplementation(async ({ data }) => ({ id: "new-application", ...data }));
  mocks.update.mockResolvedValue({ id: "new-application" });
  mocks.notify.mockResolvedValue({ admin: { sent: true }, applicant: { sent: true } });
});
afterEach(() => {
  // The only possible update is the existing notification-delivery timestamp.
  for (const [args] of mocks.update.mock.calls) {
    expect(args.where).toEqual({ id: "new-application" });
    expect(Object.keys(args.data)).toEqual(["notificationsSentAt"]);
  }
});

describe("authenticated application ownership (real route + services)", () => {
  it("links only the server-verified existing Customer and creates no extra business records", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.findCustomer).toHaveBeenCalledWith({
      where: { supabaseUserId: authId }, select: { id: true, status: true, archivedAt: true, deactivatedAt: true },
    });
    expect(mocks.create).toHaveBeenCalledOnce();
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.customerId).toBe(customer.id);
    expect(data.events).toEqual({ create: { toStatus: "PENDING" } });
    expect(data.status).toBe("PENDING");
    expect(Object.keys(data).sort()).toEqual([
      "customerId", "fullName", "email", "country", "phone", "lessonLanguage", "requestedLevel",
      "kirarModel", "applicantMessage", "isUnder15", "guardianName", "guardianRelationship",
      "guardianPhone", "guardianConsentAt", "locale", "status", "events",
    ].sort());
    expect(mocks.notify).toHaveBeenCalledOnce();
  });
  it("preserves genuine guest submission with null-by-default ownership", async () => {
    guest();
    expect((await POST(request())).status).toBe(200);
    expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty("customerId");
    expect(mocks.findCustomer).not.toHaveBeenCalled();
  });
  it.each([true, false])("ignores spoofed client identity (authenticated=%s)", async authenticated => {
    if (!authenticated) guest();
    expect((await POST(request({ ...input, customerId: "victim", supabaseUserId: "victim-auth", studentProfileId: "victim-learner" }))).status).toBe(200);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.customerId ?? null).toBe(authenticated ? customer.id : null);
    expect(data).not.toHaveProperty("supabaseUserId");
    expect(data).not.toHaveProperty("studentProfileId");
  });
  it("preserves another person's contact email without looking up/claiming their Customer", async () => {
    expect((await POST(request({ ...input, email: "Other-Customer@Example.invalid" }))).status).toBe(200);
    expect(mocks.findCustomer.mock.calls[0][0].where).toEqual({ supabaseUserId: authId });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ customerId: customer.id, email: "other-customer@example.invalid" });
    expect(mocks.notify.mock.calls[0][0].email).toBe("other-customer@example.invalid");
  });
  it.each([
    null, { ...customer, status: "DEACTIVATED" }, { ...customer, archivedAt: new Date() },
    { ...customer, deactivatedAt: new Date() },
  ])("rejects missing/inactive Customer without provisioning or guest fallback: %j", async value => {
    mocks.findCustomer.mockResolvedValue(value);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it.each([
    { ...user, email_confirmed_at: null }, { ...user, email_confirmed_at: "invalid" }, { ...user, email: null },
  ])("rejects unverified/ineligible Auth user: %j", async value => {
    mocks.getUser.mockResolvedValue({ data: { user: value }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.findCustomer).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["sb-test-auth-token", "sb-test-auth-token.0", "sb-test-auth-token.12"])("does not downgrade invalid/stale session cookie %s", async name => {
    mocks.cookies.mockReturnValue([{ name, value: "" }]);
    mocks.getUser.mockImplementation(async () => {
      mocks.cookies.mockReturnValue([]); // SDK may clear failed session cookies.
      return { data: { user: null }, error: new AuthSessionMissingError() };
    });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not confuse a PKCE verifier or unrelated cookie with a login", async () => {
    guest();
    mocks.cookies.mockReturnValue([{ name: "sb-test-auth-token-code-verifier", value: "unused" }, { name: "locale", value: "en" }]);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.findCustomer).not.toHaveBeenCalled();
  });
  it.each([401, 500])("does not downgrade Auth errors to guest (status=%s)", async status => {
    guest();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("private error", status, "test") });
    const response = await POST(request());
    expect(response.status).toBe(status === 500 ? 503 : 401);
    expect(await response.text()).not.toContain("private error");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects unsupported bearer credentials instead of pretending they are a guest", async () => {
    guest();
    expect((await POST(request(input, { origin: "https://academy.invalid", authorization: "Bearer fake" }))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([true, false])("never claims/updates an existing duplicate or resends emails (authenticated=%s)", async authenticated => {
    if (!authenticated) guest();
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.8.0" }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{}, { origin: "null" }, { origin: "https://attacker.invalid" }, { origin: "https://academy.invalid.attacker.invalid" }])("rejects absent/cross origin before authentication/writes: %j", async headers => {
    expect((await POST(request(input, headers))).status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
