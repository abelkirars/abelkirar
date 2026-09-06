import { beforeEach, describe, expect, it, vi } from "vitest";
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { product: { findMany } } }));
import { readCatalog, productImages } from "./catalog";

beforeEach(() => vi.clearAllMocks());
describe("catalog availability", () => {
  it("distinguishes an empty catalog from an outage", async () => {
    findMany.mockResolvedValue([]);
    expect(await readCatalog()).toEqual({ available: true, products: [] });
    findMany.mockRejectedValue({ code: "P1000", message: "secret connection details" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readCatalog()).toEqual({ available: false, products: [] });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    log.mockRestore();
  });
  it("always hides inactive products while preserving the requested filter", async () => {
    findMany.mockResolvedValue([]);
    await readCatalog({ category: "KIRAR", isActive: false });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { category: "KIRAR", isActive: true } }));
  });
  it("handles legacy malformed image JSON safely", () => {
    expect(productImages(null)).toEqual([]);
    expect(productImages({})).toEqual([]);
    expect(productImages([null, 4, "javascript:alert(1)", "https://example.com/photo.jpg"])).toEqual(["https://example.com/photo.jpg"]);
  });
});
