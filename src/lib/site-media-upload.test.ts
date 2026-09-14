import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { uploadWebsiteMedia } from "./site-media-upload";

afterEach(() => vi.unstubAllEnvs());

it("uploads in chunks and recovers a failed chunk using the signed token, without a student session", async () => {
  const source = Buffer.alloc(7 * 1024 * 1024, 42);
  const parts: Buffer[] = [];
  let offset = 0;
  let failedOnce = false;
  const methods: string[] = [];
  const signatures: string[] = [];
  let metadata = "";
  const server = createServer(async (request, response) => {
    methods.push(request.method ?? "");
    signatures.push(String(request.headers["x-signature"]));
    expect(request.headers.authorization).toBeUndefined();
    response.setHeader("Tus-Resumable", "1.0.0");
    if (request.method === "HEAD") {
      response.setHeader("Upload-Offset", offset);
      response.setHeader("Upload-Length", source.length);
      response.end(); return;
    }
    if (request.method === "PATCH" && !failedOnce) {
      failedOnce = true;
      request.resume(); response.writeHead(503); response.end(); return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    parts.push(body); offset += body.length;
    response.setHeader("Upload-Offset", offset);
    if (request.method === "POST") {
      metadata = String(request.headers["upload-metadata"]);
      response.setHeader("Location", "/storage/v1/upload/resumable/test-upload");
      response.writeHead(201);
    } else response.writeHead(204);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `http://127.0.0.1:${address.port}`);
  const progress: number[] = [];
  try {
    // tus uses Buffer in Node and File in browsers; both drive the same actual protocol.
    await uploadWebsiteMedia(source as unknown as File, { path: "uploads/admin/home-performance/test.mov", token: "test-signed-token" }, "video/quicktime", (percent) => progress.push(percent), new AbortController().signal);
    expect(Buffer.concat(parts).equals(source)).toBe(true);
    expect(failedOnce).toBe(true);
    expect(methods).toContain("HEAD");
    expect(signatures.every((value) => value === "test-signed-token")).toBe(true);
    expect(metadata).toContain(`contentType ${Buffer.from("video/quicktime").toString("base64")}`);
    expect(progress.at(-1)).toBe(100);
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
  }
}, 15000);
