import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueStudent = vi.fn();
const mockDeleteStudent = vi.fn();
const mockFindManyAttachment = vi.fn();
const mockDeleteManyAttachment = vi.fn();
// $transaction mocked in array form, per the established convention (see
// docs/DECISIONS.md's "Order and payment test coverage" entry) — proves
// both statements ran with the expected args, not real atomicity, which
// nothing on this machine can test (P1001).
const mockTransaction = vi.fn((ops: unknown[]) => Promise.all(ops));
vi.mock("@/lib/db", () => ({
  prisma: {
    studentProfile: {
      findUnique: (...args: unknown[]) => mockFindUniqueStudent(...args),
      delete: (...args: unknown[]) => mockDeleteStudent(...args),
    },
    weeklyPracticeAttachment: {
      findMany: (...args: unknown[]) => mockFindManyAttachment(...args),
      deleteMany: (...args: unknown[]) => mockDeleteManyAttachment(...args),
    },
    $transaction: (ops: unknown[]) => mockTransaction(ops),
  },
}));

const mockDeleteRecordingObjectOrThrow = vi.fn();
vi.mock("@/lib/student-recordings", () => ({
  deleteRecordingObjectOrThrow: (...args: unknown[]) => mockDeleteRecordingObjectOrThrow(...args),
}));

const mockDeleteStudentAuthAccount = vi.fn();
vi.mock("@/lib/supabase-admin-auth", () => ({
  deleteStudentAuthAccount: (...args: unknown[]) => mockDeleteStudentAuthAccount(...args),
}));

import { DELETE } from "@/app/api/admin/students/[studentId]/route";

function buildRequest(): Request {
  return new Request("http://localhost/api/admin/students/student-1", { method: "DELETE" });
}

function params(studentId = "student-1") {
  return { params: Promise.resolve({ studentId }) };
}

const existingStudent = {
  id: "student-1",
  supabaseUserId: "auth-user-1",
  fullName: "Test Student",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
  mockFindUniqueStudent.mockResolvedValue(existingStudent);
  mockFindManyAttachment.mockResolvedValue([]);
  mockDeleteRecordingObjectOrThrow.mockResolvedValue(undefined);
  mockDeleteStudentAuthAccount.mockResolvedValue(undefined);
  mockDeleteManyAttachment.mockResolvedValue({ count: 0 });
  mockDeleteStudent.mockResolvedValue(existingStudent);
  mockTransaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
});

describe("DELETE /api/admin/students/[studentId]", () => {
  it("admin can delete a student — recordings removed, then the auth account, then the database, in that order", async () => {
    mockFindManyAttachment.mockResolvedValue([
      { storagePath: "student-1/recording-a.webm" },
      { storagePath: "student-1/recording-b.webm" },
    ]);
    const callOrder: string[] = [];
    mockDeleteRecordingObjectOrThrow.mockImplementation(async () => {
      callOrder.push("storage");
    });
    mockDeleteStudentAuthAccount.mockImplementation(async () => {
      callOrder.push("auth");
    });
    mockTransaction.mockImplementation(async (ops: unknown[]) => {
      callOrder.push("database");
      return Promise.all(ops);
    });

    const res = await DELETE(buildRequest(), params());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockDeleteRecordingObjectOrThrow).toHaveBeenCalledTimes(2);
    expect(mockDeleteStudentAuthAccount).toHaveBeenCalledWith("auth-user-1");
    expect(mockDeleteManyAttachment).toHaveBeenCalledWith({
      where: { weeklyPractice: { studentId: "student-1" } },
    });
    expect(mockDeleteStudent).toHaveBeenCalledWith({ where: { id: "student-1" } });
    // Storage before Auth before the database transaction — a storage or
    // Auth failure must leave the database row intact to retry against;
    // the database delete is the one step that cannot be recovered from,
    // so it runs last, only once everything upstream is confirmed gone.
    expect(callOrder).toEqual(["storage", "storage", "auth", "database"]);
  });

  // No student session can ever satisfy requireAdminApi() — it only ever
  // reads the admin_session cookie, which a student's Supabase auth token
  // is not. A student's request is therefore indistinguishable, at this
  // guard, from a request with no session at all: both fail the same way,
  // which is the actual security property being demonstrated here.
  it("neither an unauthenticated visitor nor a logged-in student can call it", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await DELETE(buildRequest(), params());

    expect(res.status).toBe(401);
    expect(mockFindUniqueStudent).not.toHaveBeenCalled();
    expect(mockDeleteRecordingObjectOrThrow).not.toHaveBeenCalled();
    expect(mockDeleteStudentAuthAccount).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("a nonexistent student is handled safely — 404, nothing touched", async () => {
    mockFindUniqueStudent.mockResolvedValue(null);

    const res = await DELETE(buildRequest(), params("does-not-exist"));

    expect(res.status).toBe(404);
    expect(mockFindManyAttachment).not.toHaveBeenCalled();
    expect(mockDeleteStudentAuthAccount).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("storage cleanup is attempted for every recording", async () => {
    mockFindManyAttachment.mockResolvedValue([
      { storagePath: "student-1/a.webm" },
      { storagePath: "student-1/b.webm" },
      { storagePath: "student-1/c.webm" },
    ]);

    await DELETE(buildRequest(), params());

    expect(mockDeleteRecordingObjectOrThrow).toHaveBeenCalledTimes(3);
    expect(mockDeleteRecordingObjectOrThrow).toHaveBeenCalledWith("student-1/a.webm");
    expect(mockDeleteRecordingObjectOrThrow).toHaveBeenCalledWith("student-1/b.webm");
    expect(mockDeleteRecordingObjectOrThrow).toHaveBeenCalledWith("student-1/c.webm");
  });

  it("a storage failure stops immediately — no auth deletion, no database transaction, does not report success", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindManyAttachment.mockResolvedValue([
      { storagePath: "student-1/a.webm" },
      { storagePath: "student-1/b.webm" },
    ]);
    mockDeleteRecordingObjectOrThrow
      .mockRejectedValueOnce(new Error("Supabase Storage unreachable"))
      .mockResolvedValueOnce(undefined);

    const res = await DELETE(buildRequest(), params());

    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.ok).not.toBe(true);
    // Stops at the first failure — the second recording is never attempted.
    expect(mockDeleteRecordingObjectOrThrow).toHaveBeenCalledTimes(1);
    expect(mockDeleteStudentAuthAccount).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("an auth failure after successful storage cleanup stops before the database — does not report success", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDeleteStudentAuthAccount.mockRejectedValue(new Error("Supabase Auth unreachable"));

    const res = await DELETE(buildRequest(), params());

    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.ok).not.toBe(true);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDeleteStudent).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a database failure after storage and auth already succeeded still does not report success", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockTransaction.mockRejectedValue(new Error("connection reset"));

    const res = await DELETE(buildRequest(), params());

    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.ok).not.toBe(true);
    // Both upstream steps DID run — this is the honest "everything else
    // succeeded, only the database step failed" case.
    expect(mockDeleteStudentAuthAccount).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("deletes WeeklyPracticeAttachment rows explicitly, in the same transaction as the profile delete — not left to an implicit cascade alone", async () => {
    await DELETE(buildRequest(), params());

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDeleteManyAttachment).toHaveBeenCalledWith({
      where: { weeklyPractice: { studentId: "student-1" } },
    });
    expect(mockDeleteStudent).toHaveBeenCalledWith({ where: { id: "student-1" } });
  });
});
