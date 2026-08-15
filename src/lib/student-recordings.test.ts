import { describe, it, expect, vi, beforeEach } from "vitest";

// student-recordings.ts has `import "server-only"`, which throws under
// plain Node/Vitest regardless of context (same reason dal.ts/queries.ts
// never carry that guard). Unlike those files, this one genuinely needs
// the guard kept for production (per explicit instruction) — so instead of
// removing it, the package itself is mocked to a no-op here, ONLY inside
// this test file. Production behavior is untouched; this just lets the
// REAL allowlist/size-cap logic run in a test instead of only being
// provable by mocking @/lib/student-recordings one layer up (which would
// prove nothing beyond "the mock does what the mock says").
vi.mock("server-only", () => ({}));

const mockCreateSignedUploadUrl = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockRemove = vi.fn();
const mockList = vi.fn();
// Mocked at the exact boundary this file imports (@/lib/supabase-admin),
// not one level deeper — matching the DECISIONS.md server-only-guard
// convention. This lets the REAL allowlist/size-cap logic in
// student-recordings.ts run for real in these tests, only the Supabase
// network calls are faked.
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        createSignedUploadUrl: (...args: unknown[]) => mockCreateSignedUploadUrl(...args),
        createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
        remove: (...args: unknown[]) => mockRemove(...args),
        list: (...args: unknown[]) => mockList(...args),
      }),
    },
  },
}));

import {
  createRecordingUploadUrl,
  getRecordingSignedUrl,
  deleteRecordingObject,
  verifyRecordingObject,
  InvalidRecordingError,
  MAX_RECORDING_BYTES,
  ALLOWED_RECORDING_TYPES,
} from "@/lib/student-recordings";

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateSignedUploadUrl.mockResolvedValue({
    data: { signedUrl: "https://signed.example/upload", token: "tok", path: "ignored-by-caller" },
    error: null,
  });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://signed.example/view" },
    error: null,
  });
  mockRemove.mockResolvedValue({ data: [], error: null });
  mockList.mockResolvedValue({ data: [], error: null });
});

describe("createRecordingUploadUrl", () => {
  it("mints a signed upload URL for an allowed type within the size cap, with a server-derived path", async () => {
    const result = await createRecordingUploadUrl("student-1", "wp-1", {
      mimeType: "audio/webm",
      fileSize: 1_000_000,
    });
    expect(result.signedUrl).toBe("https://signed.example/upload");
    expect(result.path).toMatch(/^students\/student-1\/weekly-practice\/wp-1\/.+\.webm$/);
  });

  it("a disallowed mimeType is refused at sign-upload — this is the real gate, checked before Supabase is ever called", async () => {
    await expect(
      createRecordingUploadUrl("student-1", "wp-1", { mimeType: "application/pdf", fileSize: 1000 })
    ).rejects.toThrow(InvalidRecordingError);
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a file over the size cap", async () => {
    await expect(
      createRecordingUploadUrl("student-1", "wp-1", {
        mimeType: "audio/webm",
        fileSize: MAX_RECORDING_BYTES + 1,
      })
    ).rejects.toThrow(InvalidRecordingError);
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("the allowlist actually contains the types the UI is expected to send", () => {
    expect(ALLOWED_RECORDING_TYPES.has("audio/webm")).toBe(true);
    expect(ALLOWED_RECORDING_TYPES.has("audio/mp4")).toBe(true);
    expect(ALLOWED_RECORDING_TYPES.has("video/mp4")).toBe(true);
    expect(ALLOWED_RECORDING_TYPES.has("application/pdf")).toBe(false);
  });
});

describe("getRecordingSignedUrl", () => {
  it("returns a signed URL for a given path", async () => {
    const url = await getRecordingSignedUrl("students/student-1/weekly-practice/wp-1/x.webm");
    expect(url).toBe("https://signed.example/view");
  });

  it("returns null when Supabase reports an error, rather than throwing", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: "not found" } });
    const url = await getRecordingSignedUrl("bad/path");
    expect(url).toBeNull();
  });
});

describe("deleteRecordingObject", () => {
  it("never throws, even when Supabase reports an error — best-effort cleanup only", async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(deleteRecordingObject("some/path")).resolves.toBeUndefined();
  });
});

describe("verifyRecordingObject", () => {
  const path = "students/student-1/weekly-practice/wp-1/abc123.webm";

  it("resolves with the actual size and mimeType when both are within policy, and deletes nothing", async () => {
    mockList.mockResolvedValue({
      data: [{ name: "abc123.webm", metadata: { size: 1_000_000, mimetype: "audio/webm" } }],
      error: null,
    });
    const result = await verifyRecordingObject(path);
    expect(result).toEqual({ fileSize: 1_000_000, mimeType: "audio/webm" });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("rejects and deletes the object when the ACTUAL size exceeds the cap — a client-declared size within the cap must not be trusted", async () => {
    mockList.mockResolvedValue({
      data: [
        { name: "abc123.webm", metadata: { size: MAX_RECORDING_BYTES + 1, mimetype: "audio/webm" } },
      ],
      error: null,
    });
    await expect(verifyRecordingObject(path)).rejects.toThrow(InvalidRecordingError);
    expect(mockRemove).toHaveBeenCalledWith([path]);
  });

  it("rejects and deletes the object when the ACTUAL stored content-type is not on the allowlist — createSignedUploadUrl enforces no content-type constraint of its own, so a client could declare an allowed type at sign-upload and upload something else entirely", async () => {
    mockList.mockResolvedValue({
      data: [{ name: "abc123.webm", metadata: { size: 1_000_000, mimetype: "application/x-msdownload" } }],
      error: null,
    });
    await expect(verifyRecordingObject(path)).rejects.toThrow(InvalidRecordingError);
    expect(mockRemove).toHaveBeenCalledWith([path]);
  });

  it("fails closed and deletes the object when neither size nor mimeType can be determined at all", async () => {
    mockList.mockResolvedValue({ data: [], error: null });
    await expect(verifyRecordingObject(path)).rejects.toThrow(InvalidRecordingError);
    expect(mockRemove).toHaveBeenCalledWith([path]);
  });
});
