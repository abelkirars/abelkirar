import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), configure: vi.fn(), open: vi.fn(), prepare: vi.fn() }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: m.auth }));
vi.mock("@/lib/courses/cohorts", () => ({ createCohort: m.create, configureCohort: m.configure, openCohort: m.open }));
vi.mock("@/lib/courses/prepare-enrollment", () => ({ prepareEnrollment: m.prepare }));
vi.mock("@/lib/courses/admin-response", () => ({ preparationErrorResponse: () => NextResponse.json({ error: "Rejected" }, { status: 400 }) }));
import { POST } from "./route";
import { PATCH } from "./[id]/route";
import { POST as prepare } from "../course-applications/[id]/prepare/route";
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }); });
it("blocks anonymous create, schedule/open and preparation before resolving any IDs", async () => {
  const request = () => new Request("http://localhost", { method: "POST", body: "{}" });
  const params = { params: Promise.resolve({ id: "someone-elses-record" }) };
  expect((await POST(request())).status).toBe(401);
  expect((await PATCH(request(), params)).status).toBe(401);
  expect((await prepare(request(), params)).status).toBe(401);
  for (const fn of [m.create, m.configure, m.open, m.prepare]) expect(fn).not.toHaveBeenCalled();
});
it("rejects extra client controls on OPEN", async () => {
  m.auth.mockResolvedValue({ session: { adminId: "admin" } });
  const request = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "OPEN", maximumStudents: 5 }) });
  expect((await PATCH(request, { params: Promise.resolve({ id: "cohort" }) })).status).toBe(400);
  expect(m.open).not.toHaveBeenCalled();
});
