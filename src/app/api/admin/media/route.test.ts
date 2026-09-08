import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), getMedia: vi.fn(), bucket: vi.fn(), createBucket: vi.fn(), signed: vi.fn(), list: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/site-media", () => ({ getSiteMedia: mocks.getMedia }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: mocks.auth }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { storage: {
  getBucket: mocks.bucket, createBucket: mocks.createBucket,
  from: () => ({ createSignedUploadUrl: mocks.signed, list: mocks.list, upload: mocks.upload, remove: mocks.remove, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.com/${path}` } }) }),
} } }));
import { POST, PUT, PATCH, DELETE } from "./route";
import { isMediaSlot } from "@/lib/site-media-config";
const path = "uploads/admin-1/home-performance/12345678-1234-1234-1234-123456789abc.mp4";
const request = (body: unknown) => new Request("https://example.com/api/admin/media", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMedia.mockResolvedValue({ url: "https://example.com/uploads/existing.mp4", title: "Old", transcript: "", mimeType: "video/mp4" });
  mocks.auth.mockResolvedValue({ session: { adminId: "admin-1" } });
  mocks.bucket.mockResolvedValue({ data: { id: "site-media" }, error: null });
  mocks.signed.mockResolvedValue({ data: { token: "signed-token" }, error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.list.mockResolvedValue({ data: [{ name: path.split("/").pop(), metadata: { size: 1000, mimetype: "video/mp4" } }], error: null });
});
describe("admin website media", () => {
  it("requires admin authorization for every operation", async () => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    for (const handler of [POST, PUT, PATCH, DELETE]) expect((await handler(request({}))).status).toBe(401);
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects prototype names, unsupported types, and oversize files", async () => {
    expect(isMediaSlot("constructor")).toBe(false);
    for (const body of [{ slot: "constructor", mimeType: "video/mp4", size: 1000 }, { slot: "home-performance", mimeType: "image/svg+xml", size: 1000 }, { slot: "home-performance", mimeType: "video/mp4", size: 51 * 1024 * 1024 }]) expect((await POST(request(body))).status).toBe(400);
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("signs only a fresh server-derived path under the current admin", async () => {
    const response = await POST(request({ slot: "home-performance", mimeType: "video/mp4", size: 1000 }));
    expect(response.status).toBe(200);
    expect(mocks.signed).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/admin-1\/home-performance\/[a-f0-9-]+\.mp4$/));
  });
  it("rejects PDF documents in every public media placement", async () => {
    for (const slot of ["home-performance", "course-sample", "kirar-audio", "teacher-photo"]) {
      expect((await POST(request({ slot, mimeType: "application/pdf", size: 1000 }))).status).toBe(400);
    }
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("rejects another admin's upload and path traversal", async () => {
    for (const badPath of [path.replace("admin-1", "admin-2"), "uploads/admin-1/home-performance/../x.mp4"]) expect((await PUT(request({ slot: "home-performance", path: badPath, title: "Performance", transcript: "" }))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("verifies the actual storage object before changing the published asset", async () => {
    mocks.list.mockResolvedValue({ data: [{ name: path.split("/").pop(), metadata: { size: 60000000, mimetype: "video/mp4" } }], error: null });
    expect((await PUT(request({ slot: "home-performance", path, title: "Performance", transcript: "" }))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("publishes only verified files and retains existing media on failure", async () => {
    const body = { slot: "home-performance", path, title: "Performance", transcript: "A Kirar hymn." };
    expect((await PUT(request(body))).status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith("published/home-performance.json", expect.stringContaining("A Kirar hymn."), expect.objectContaining({ upsert: true }));
    mocks.upload.mockResolvedValue({ error: new Error("Storage unavailable") });
    expect((await PUT(request(body))).status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

it("edits descriptions without accepting a replacement URL or signing an upload", async () => {
  const response = await PATCH(request({ slot: "home-performance", title: " Updated title ", transcript: "New transcript" }));
  expect(response.status).toBe(200);
  expect((await response.json()).media).toEqual({ url: "https://example.com/uploads/existing.mp4", title: "Updated title", transcript: "New transcript", mimeType: "video/mp4" });
  expect(mocks.signed).not.toHaveBeenCalled();
  expect((await PATCH(request({ slot: "home-performance", title: "Title", transcript: "", url: "https://other.test/video.mp4" }))).status).toBe(400);
});
it("does not overwrite missing or unreadable published media", async () => {
  mocks.getMedia.mockResolvedValue(null);
  expect((await PATCH(request({ slot: "home-performance", title: "Title", transcript: "" }))).status).toBe(409);
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("reports storage failures when saving details", async () => {
  mocks.upload.mockResolvedValue({ error: new Error("Unavailable") });
  expect((await PATCH(request({ slot: "home-performance", title: "Title", transcript: "" }))).status).toBe(503);
  expect(mocks.remove).not.toHaveBeenCalled();
});
