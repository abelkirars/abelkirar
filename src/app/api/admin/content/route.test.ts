import { describe, it, expect, vi, beforeEach } from "vitest";
const mockRevalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag: mockRevalidateTag }));

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();
const mockTransaction = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    siteCopy: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { PUT } from "@/app/api/admin/content/route";
import { defaultCopy } from "@/lib/site-copy-defaults";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({
    session: { adminId: "admin-1", displayName: "Deacon Abel" },
  });
  mockUpsert.mockImplementation((args: unknown) => args);
  mockDeleteMany.mockImplementation((args: unknown) => args);
  mockTransaction.mockResolvedValue([]);
});

describe("PUT /api/admin/content", () => {
  it("expires the saved locale after commit, including resets", async () => {
    await PUT(buildRequest({ changes: [{ locale: "en", key: "about.paragraph1", value: defaultCopy("en")["about.paragraph1"] }] }));
    expect(mockRevalidateTag).toHaveBeenCalledExactlyOnceWith("site-copy:en", { expire: 0 });
    expect(mockTransaction.mock.invocationCallOrder[0]).toBeLessThan(mockRevalidateTag.mock.invocationCallOrder[0]);
  });

  it("does not invalidate cached text if the transaction fails", async () => {
    mockTransaction.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(PUT(buildRequest({ changes: [{ locale: "en", key: "about.paragraph1", value: "An edit" }] }))).rejects.toThrow("Database unavailable");
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
  it("rejects a caller without an admin session before touching the database", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await PUT(
      buildRequest({ changes: [{ locale: "en", key: "about.paragraph1", value: "x" }] })
    );
    expect(res.status).toBe(401);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("stores an edited string against its locale and key, with the editor's name", async () => {
    const res = await PUT(
      buildRequest({
        changes: [{ locale: "en", key: "about.paragraph1", value: "I started in 2012." }],
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, saved: 1, restored: 0 });

    const call = mockUpsert.mock.calls.at(-1)?.[0] as {
      where: { locale_key: { locale: string; key: string } };
      create: { value: string; updatedBy: string };
    };
    expect(call.where.locale_key).toEqual({ locale: "en", key: "about.paragraph1" });
    expect(call.create.value).toBe("I started in 2012.");
    expect(call.create.updatedBy).toBe("Deacon Abel");
  });

  it("deletes the row when the text is set back to the shipped wording", async () => {
    // "Unedited" has exactly one representation in the table: no row. Saving
    // a copy of the default instead would make "has this been changed?"
    // answerable two different ways.
    const original = defaultCopy("en")["hero.title"];
    const res = await PUT(
      buildRequest({ changes: [{ locale: "en", key: "hero.title", value: original }] })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ saved: 0, restored: 1 });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteMany.mock.calls.at(-1)?.[0]).toEqual({
      where: { locale: "en", key: "hero.title" },
    });
  });

  it("refuses a key that is not a text field on the site", async () => {
    const res = await PUT(
      buildRequest({ changes: [{ locale: "en", key: "about.notAField", value: "x" }] })
    );
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses an edit that drops a placeholder", async () => {
    // next-intl throws on a message whose arguments do not line up, so this
    // is the one edit a copy change can make that takes a page down.
    const res = await PUT(
      buildRequest({
        changes: [
          { locale: "en", key: "emails.orderPending.subject", value: "Your order is pending" },
        ],
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ key: "emails.orderPending.subject" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses an edit that invents a placeholder the page never passes", async () => {
    const res = await PUT(
      buildRequest({
        changes: [{ locale: "en", key: "hero.title", value: "Learn {instrument} today" }],
      })
    );
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("accepts a rewording that keeps the placeholder", async () => {
    const res = await PUT(
      buildRequest({
        changes: [
          {
            locale: "en",
            key: "emails.orderPending.subject",
            value: "We received order {orderNumber}",
          },
        ],
      })
    );
    expect(res.status).toBe(200);
  });

  it("writes nothing at all when one change in the batch is invalid", async () => {
    // A section saved half-way, with no indication of which half, is worse
    // than a refusal.
    const res = await PUT(
      buildRequest({
        changes: [
          { locale: "en", key: "about.paragraph1", value: "A fine edit." },
          { locale: "en", key: "about.notAField", value: "A bad one." },
        ],
      })
    );
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects an unknown locale", async () => {
    const res = await PUT(
      buildRequest({ changes: [{ locale: "fr", key: "hero.title", value: "Bonjour" }] })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a body that is not JSON", async () => {
    const res = await PUT(
      new Request("http://localhost/api/admin/content", { method: "PUT", body: "not json" })
    );
    expect(res.status).toBe(400);
  });
});
