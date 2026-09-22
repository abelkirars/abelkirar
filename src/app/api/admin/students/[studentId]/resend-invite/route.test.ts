import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn(), invite: vi.fn(), notify: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: async () => ({ session: { adminId: "admin" } }) }));
vi.mock("@/lib/db", () => ({ prisma: { studentProfile: { findUnique: mocks.find } } }));
vi.mock("@/lib/supabase-admin-auth", () => ({ generateStudentInviteLink: mocks.invite, StudentInviteError: class extends Error {} }));
vi.mock("@/lib/notifications", () => ({ notificationService: { notifyStudentInvite: mocks.notify } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.limit }));
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue(true);
  mocks.invite.mockResolvedValue({ actionLink: "https://example.invalid/invite", supabaseUserId: "auth" });
  mocks.notify.mockResolvedValue({ sent: true });
});
const call = () => POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ studentId: "learner" }) });
it.each([[null, null], [null, "contact@example.invalid"], ["auth", null]])("does not invite with identity %s / %s", async (supabaseUserId, email) => {
  mocks.find.mockResolvedValue({ supabaseUserId, email });
  expect((await call()).status).toBe(409);
  expect(mocks.invite).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
});
it("preserves learner-owned account invitations", async () => {
  mocks.find.mockResolvedValue({ supabaseUserId: "auth", email: "learner@example.invalid", fullName: "Learner", locale: "en" });
  expect((await call()).status).toBe(200);
  expect(mocks.notify).toHaveBeenCalledWith("learner@example.invalid", "Learner", "https://example.invalid/invite", "en");
});
