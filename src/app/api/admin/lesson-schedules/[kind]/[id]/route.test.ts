import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { POST } from "./route";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), draft: vi.fn(), publish: vi.fn(), archive: vi.fn() }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: mocks.auth }));
vi.mock("@/lib/courses/lesson-schedules", () => ({ saveLessonScheduleDraft: mocks.draft, publishLessonSchedule: mocks.publish, archiveLessonSchedule: mocks.archive }));
const slot = { ordinal: 1, weekday: "TUESDAY", localStartMinute: 600, durationMinutes: 60, timeZone: "America/Chicago", effectiveStartDate: "2026-10-03", effectiveEndDate: null };
const draft = { teacherAdminId: "explicit-teacher", slots: [slot, { ...slot, ordinal: 2, weekday: "SATURDAY" }] };
const ctx = { params: Promise.resolve({ kind: "cohort", id: "group" }) };
const request = (body: unknown, headers = {}) => new Request("https://academy.example/api/admin/lesson-schedules/cohort/group", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ session: { adminId: "admin" } }); mocks.draft.mockResolvedValue([]); mocks.publish.mockResolvedValue([]); mocks.archive.mockResolvedValue({ archivedCount: 2 }); });

it.each(["draft", "publish", "archive"])("denies non-admin %s before invoking a service", async action => {
  mocks.auth.mockResolvedValue({ response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
  expect((await POST(request({ action, draft, confirmed: true }), ctx)).status).toBe(401);
  expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.archive).not.toHaveBeenCalled();
});
it("uses the cohort owner from the route and allows an explicit one-lesson draft", async () => {
  const one = { ...draft, slots: [slot] };
  expect((await POST(request({ action: "draft", draft: one }), ctx)).status).toBe(200);
  expect(mocks.draft).toHaveBeenCalledExactlyOnceWith({ kind: "cohort", id: "group" }, one);
  expect(mocks.publish).not.toHaveBeenCalled();
});
it("dispatches a private owner without inventing a cohort", async () => {
  expect((await POST(request({ action: "draft", draft }), { params: Promise.resolve({ kind: "enrollment", id: "private" }) })).status).toBe(200);
  expect(mocks.draft).toHaveBeenCalledWith({ kind: "enrollment", id: "private" }, draft);
});
it.each([
  { ...draft, teacherAdminId: "" },
  { ...draft, slots: [] },
  { ...draft, slots: [slot, { ...slot, ordinal: 2 }] },
  { ...draft, slots: [{ ...slot, localStartMinute: 1440 }] },
  { ...draft, slots: [{ ...slot, localStartMinute: 1410 }] },
  { ...draft, slots: [{ ...slot, timeZone: "UTC" }] },
  { ...draft, slots: [{ ...slot, effectiveEndDate: "2026-10-02" }] },
])("rejects invalid draft on the server before writes: %j", async invalid => {
  expect((await POST(request({ action: "draft", draft: invalid }), ctx)).status).toBe(400);
  expect(mocks.draft).not.toHaveBeenCalled();
});
it("accepts different weekdays with independent durations", async () => {
  const valid = { ...draft, slots: [slot, { ...draft.slots[1], durationMinutes: 45 }] };
  expect((await POST(request({ action: "draft", draft: valid }), ctx)).status).toBe(200);
  expect(mocks.draft).toHaveBeenCalledWith({ kind: "cohort", id: "group" }, valid);
});
it("publication only uses saved server state, rejecting client slot injection", async () => {
  expect((await POST(request({ action: "publish", draft }), ctx)).status).toBe(400);
  expect(mocks.publish).not.toHaveBeenCalled();
  expect((await POST(request({ action: "publish" }), ctx)).status).toBe(200);
  expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({ kind: "cohort", id: "group" });
});
it("requires explicit archive confirmation", async () => {
  expect((await POST(request({ action: "archive" }), ctx)).status).toBe(400);
  expect(mocks.archive).not.toHaveBeenCalled();
  expect((await POST(request({ action: "archive", confirmed: true }), ctx)).status).toBe(200);
  expect(mocks.archive).toHaveBeenCalledExactlyOnceWith({ kind: "cohort", id: "group" });
});
it("does not accept client identity/owner overrides or unknown owner kinds", async () => {
  expect((await POST(request({ action: "draft", draft, customerId: "other" }), ctx)).status).toBe(400);
  expect((await POST(request({ action: "publish" }), { params: Promise.resolve({ kind: "student", id: "other" }) })).status).toBe(400);
  expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
});
it("rejects cross-origin and non-JSON commands", async () => {
  expect((await POST(request({ action: "publish" }, { Origin: "https://other.example" }), ctx)).status).toBe(403);
  expect((await POST(request({ action: "publish" }, { "Content-Type": "text/plain" }), ctx)).status).toBe(415);
  expect(mocks.publish).not.toHaveBeenCalled();
});
it.each([
  [new Error("Teacher recurring lesson conflict"), "conflict", 409],
  [new Error("Configure both drafts explicitly before publication"), "incomplete", 409],
  [new Error("Explicit active teacher required"), "teacher", 409],
  [new Prisma.PrismaClientKnownRequestError("private DB detail", { code: "P2034", clientVersion: "7.8.0" }), "retry", 409],
  [new Prisma.PrismaClientKnownRequestError("private duplicate detail", { code: "P2002", clientVersion: "7.8.0" }), "retry", 409],
  ...["P2010", "P2004"].flatMap(prismaCode => ["40001", "40P01"].flatMap(sqlState => [
    { code: sqlState, message: "private SQL and DB detail" },
    { driverAdapterError: { cause: { originalCode: sqlState, originalMessage: "private SQL and DB detail" } } },
  ].map<[Error, string, number]>(meta => [new Prisma.PrismaClientKnownRequestError("private raw query", { code: prismaCode, clientVersion: "7.8.0", meta }), "retry", 409]))),
  ...["P2010", "P2004"].flatMap(prismaCode => [
    undefined,
    { code: "42P01", message: "SELECT private_column FROM private_table" },
    { driverAdapterError: { cause: { originalCode: "23514", originalMessage: "private constraint detail" } } },
  ].map<[Error, string, number]>(meta => [new Prisma.PrismaClientKnownRequestError("private raw query", { code: prismaCode, clientVersion: "7.8.0", meta }), "unavailable", 500])),
  [new Error("Admin authentication required"), "unauthorized", 401],
  [new Error("private connection details"), "unavailable", 500],
])("returns only safe translated error codes", async (error, code, status) => {
  mocks.publish.mockRejectedValue(error);
  const response = await POST(request({ action: "publish" }), ctx);
  expect(response.status).toBe(status); expect(await response.json()).toEqual({ error: code });
});
