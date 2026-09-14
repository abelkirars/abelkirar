import { createServer, type Socket, type AddressInfo } from "node:net";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

it("the actual pg reader times out against an accepting but unresponsive server", async () => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  // A local test-only endpoint. Never read or change production credentials.
  vi.stubEnv("DATABASE_URL", `postgresql://test:test@127.0.0.1:${port}/test`);
  const timer = vi.spyOn(globalThis, "setTimeout");
  try {
    const { readCopyRows } = await import("./site-copy-reader");
    await expect(readCopyRows("en")).rejects.toThrow();
    // Verify pg uses the intended deadline without asserting how quickly
    // a busy test worker gets CPU time to execute that timer callback.
    expect(timer.mock.calls.some((call) => call[1] === 1500)).toBe(true);
  } finally {
    timer.mockRestore();
    vi.unstubAllEnvs();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 15000);
