import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from "vitest";
import type { IncrementalCache } from "next/dist/server/lib/incremental-cache";

const read = vi.hoisted(() => vi.fn());
const afterTasks = vi.hoisted(() => [] as Array<() => Promise<void>>);
// Only the post-response scheduler is replaced; drain it explicitly below.
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => afterTasks.push(task) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/site-copy-reader", () => ({ readCopyRows: read }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

// Use Next's actual Data Cache implementation, NOT a mock cache that simply
// echoes our expected behavior. Only the external database read is controlled.
let getCopyOverrides: typeof import("./site-copy").getCopyOverrides;
let incrementalCache: IncrementalCache;
let Cache: typeof IncrementalCache;
let nodeFs: typeof import("next/dist/server/lib/node-fs-methods").nodeFs;
beforeAll(async () => {
  vi.stubGlobal("AsyncLocalStorage", AsyncLocalStorage);
  Cache = (await import("next/dist/server/lib/incremental-cache")).IncrementalCache;
  nodeFs = (await import("next/dist/server/lib/node-fs-methods")).nodeFs;
  getCopyOverrides = (await import("./site-copy")).getCopyOverrides;
});
beforeEach(() => {
  read.mockReset();
  afterTasks.length = 0;
  incrementalCache = new Cache({
    dev: false, requestHeaders: {}, fs: nodeFs,
    serverDistDir: join(tmpdir(), "site-copy-cache-tests"), flushToDisk: false,
    maxMemoryCacheSize: 1_000_000, fetchCacheKeyPrefix: randomUUID(),
    getPrerenderManifest: () => ({ version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview: { previewModeId: "test", previewModeSigningKey: "", previewModeEncryptionKey: "" } }),
  });
  vi.stubGlobal("__incrementalCache", incrementalCache);
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => vi.useRealTimers());

it("reuses the actual Next Data Cache across requests and keeps locales separate", async () => {
  read.mockImplementation(async (locale: string) => [{ key: "hero.title", value: locale }]);
  expect(await getCopyOverrides("en")).toEqual({ "hero.title": "en" });
  incrementalCache.resetRequestCache();
  expect(await getCopyOverrides("en")).toEqual({ "hero.title": "en" });
  expect(read).toHaveBeenCalledTimes(1);
  expect(await getCopyOverrides("am")).toEqual({ "hero.title": "am" });
  expect(read).toHaveBeenCalledTimes(2);
});

it("reads fresh text after the saved locale tag is expired", async () => {
  read.mockResolvedValue([{ key: "hero.title", value: "Before" }]);
  await getCopyOverrides("en");
  read.mockResolvedValue([{ key: "hero.title", value: "After" }]);
  // Next records entry times with performance.now() but tag expiry with
  // Date.now(). Model a later save request, beyond the same millisecond.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await incrementalCache.revalidateTag("site-copy:en", { expire: 0 });
  expect(await getCopyOverrides("en")).toEqual({ "hero.title": "After" });
  expect(read).toHaveBeenCalledTimes(2);
});

it("refreshes the actual cache after the 60-second lifetime", async () => {
  read.mockResolvedValue([{ key: "hero.title", value: "Before" }]);
  await getCopyOverrides("en");
  read.mockResolvedValue([{ key: "hero.title", value: "After" }]);
  const later = performance.now() + 61_000;
  const clock = vi.spyOn(performance, "now").mockReturnValue(later);
  try {
    expect(await getCopyOverrides("en")).toEqual({ "hero.title": "After" });
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});

it("bounds rendering independently of the cold-read deadline", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let started!: () => void;
  const reading = new Promise<void>((resolve) => { started = resolve; });
  read.mockImplementation(() => { started(); return new Promise(() => {}); });
  let settled = false;
  const result = getCopyOverrides("en").then((value) => { settled = true; return value; });
  await reading;
  await vi.advanceTimersByTimeAsync(299);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({});
  expect(afterTasks).toHaveLength(1);
  const background = afterTasks[0]();
  await vi.advanceTimersByTimeAsync(1700);
  await background;
  expect(await getCopyOverrides("en")).toEqual({});
  expect(read).toHaveBeenCalledTimes(1);
});

it("warms the real cache when a healthy cold connection completes after rendering falls back", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let started!: () => void;
  let finish!: (rows: Array<{ key: string; value: string }>) => void;
  const reading = new Promise<void>((resolve) => { started = resolve; });
  read.mockImplementation(() => {
    started();
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = getCopyOverrides("en");
  await reading;
  await vi.advanceTimersByTimeAsync(300);
  expect(await first).toEqual({});
  expect(afterTasks).toHaveLength(1);
  const background = afterTasks[0]();
  await vi.advanceTimersByTimeAsync(200);
  finish([{ key: "hero.title", value: "Saved admin wording" }]);
  await background;
  expect(await getCopyOverrides("en")).toEqual({ "hero.title": "Saved admin wording" });
  expect(read).toHaveBeenCalledTimes(1);
});

it("coalesces simultaneous cold database reads", async () => {
  read.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return [{ key: "hero.title", value: "Shared" }];
  });
  const values = await Promise.all(Array.from({ length: 10 }, () => getCopyOverrides("en")));
  expect(values.every((value) => value["hero.title"] === "Shared")).toBe(true);
  expect(read).toHaveBeenCalledTimes(1);
});

it("falls back if the Data Cache itself stalls", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let started!: () => void;
  const reading = new Promise<void>((resolve) => { started = resolve; });
  const stalledGet = vi.spyOn(incrementalCache, "get").mockImplementation(() => { started(); return new Promise(() => {}); });
  const result = getCopyOverrides("en");
  await reading;
  await vi.advanceTimersByTimeAsync(300);
  expect(await result).toEqual({});
  const background = afterTasks[0]();
  await vi.advanceTimersByTimeAsync(2500);
  await background;
  expect(read).not.toHaveBeenCalled();
  stalledGet.mockRestore();
});

it("caches a rejected read as file defaults", async () => {
  read.mockRejectedValue(new Error("Database unavailable"));
  expect(await getCopyOverrides("en")).toEqual({});
  expect(await getCopyOverrides("en")).toEqual({});
  expect(read).toHaveBeenCalledTimes(1);
});
