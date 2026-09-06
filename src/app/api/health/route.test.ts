import { expect, it, vi } from "vitest";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { product: { findFirst } } }));
import { GET } from "./route";
it("reports an empty but reachable catalog as healthy and schema/connection errors as 503", async () => {
  findFirst.mockResolvedValue(null);
  expect((await GET()).status).toBe(200);
  findFirst.mockRejectedValue(new Error("database credentials"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).not.toContain("credentials");
});
