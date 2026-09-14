import { describe, it, expect, vi, beforeEach } from "vitest";

// next-intl/server's real "react-server" export condition isn't resolved by
// vitest's plain node environment (it falls back to the react-client build,
// which throws on import outside a Client Component) — getRequestConfig is
// a plain identity function in production (`(fn) => fn`), so mocking it as
// exactly that tests the real behavior of our callback without needing
// Next's own module resolution conditions.
vi.mock("next-intl/server", () => ({
  getRequestConfig: (fn: unknown) => fn,
}));

let cookieLocale: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "NEXT_LOCALE" && cookieLocale !== undefined ? { value: cookieLocale } : undefined,
  }),
}));

// The override layer is a database read in production. Mocked with a factory
// (so the real module, and its `server-only` import, never load in vitest) and
// driven per test through this record — the point of these cases is the merge,
// not Prisma.
let copyOverrides: Record<string, Record<string, string>> = {};
vi.mock("@/lib/site-copy", () => ({
  getCopyOverrides: async (locale: string) => copyOverrides[locale] ?? {},
}));

import createRequestConfig from "@/i18n/request";

function withRequestLocale(locale?: string) {
  return { locale, requestLocale: Promise.resolve(undefined) };
}

describe("i18n/request.ts locale resolution", () => {
  beforeEach(() => {
    copyOverrides = {};
  });

  it("honours an explicitly passed locale (e.g. getTranslations({ locale: 'am' })), regardless of the cookie", async () => {
    cookieLocale = "en"; // the caller's own ambient cookie — must not win
    const config = await createRequestConfig(withRequestLocale("am"));
    expect(config.locale).toBe("am");
    expect((config.messages as Record<string, unknown>)).toBeTruthy();
  });

  it("honours an explicit 'en' override even when the cookie says 'am'", async () => {
    cookieLocale = "am";
    const config = await createRequestConfig(withRequestLocale("en"));
    expect(config.locale).toBe("en");
  });

  it("falls back to the NEXT_LOCALE cookie for normal page rendering (no explicit locale passed)", async () => {
    cookieLocale = "am";
    const config = await createRequestConfig(withRequestLocale(undefined));
    expect(config.locale).toBe("am");
  });

  it("falls back to the default locale when there is no explicit locale and no cookie", async () => {
    cookieLocale = undefined;
    const config = await createRequestConfig(withRequestLocale(undefined));
    expect(config.locale).toBe("en");
  });

  it("ignores an invalid cookie value and falls back to the default locale", async () => {
    cookieLocale = "fr";
    const config = await createRequestConfig(withRequestLocale(undefined));
    expect(config.locale).toBe("en");
  });

  it("ignores an invalid explicit locale and falls back to the cookie", async () => {
    cookieLocale = "am";
    // "xx" is deliberately not a real locale, to prove the guard rejects it
    const config = await createRequestConfig(withRequestLocale("xx"));
    expect(config.locale).toBe("am");
  });

  it("loads the matching messages file for the resolved locale", async () => {
    cookieLocale = undefined;
    const config = await createRequestConfig(withRequestLocale("am"));
    const messages = config.messages as { studentLogin?: { title?: string } };
    expect(messages.studentLogin?.title).toBe("የተማሪ መግቢያ");
  });
});

describe("i18n/request.ts admin copy overrides", () => {
  beforeEach(() => {
    copyOverrides = {};
  });

  it("replaces a file default with the admin's edited wording", async () => {
    cookieLocale = "en";
    copyOverrides = { en: { "about.paragraph1": "I started on a borrowed Kirar." } };
    const config = await createRequestConfig(withRequestLocale(undefined));
    const messages = config.messages as { about: { paragraph1: string; paragraph2: string } };
    expect(messages.about.paragraph1).toBe("I started on a borrowed Kirar.");
    // Untouched siblings keep their file wording — an override is one leaf,
    // not a replacement of the namespace around it.
    expect(messages.about.paragraph2).toMatch(/Kirar/);
  });

  it("keeps each locale's overrides to itself", async () => {
    cookieLocale = "am";
    copyOverrides = { en: { "about.paragraph1": "English only edit" } };
    const config = await createRequestConfig(withRequestLocale(undefined));
    const messages = config.messages as { about: { paragraph1: string } };
    expect(messages.about.paragraph1).not.toBe("English only edit");
  });

  it("ignores a stored key that no longer exists in the messages file", async () => {
    cookieLocale = "en";
    copyOverrides = { en: { "about.paragraphRemovedInV2": "orphan row" } };
    const config = await createRequestConfig(withRequestLocale(undefined));
    const messages = config.messages as { about: Record<string, string> };
    expect(messages.about.paragraphRemovedInV2).toBeUndefined();
  });

  it("does not leak one request's override into the next (no mutation of the imported JSON)", async () => {
    cookieLocale = "en";
    copyOverrides = { en: { "hero.title": "Edited once" } };
    await createRequestConfig(withRequestLocale(undefined));

    copyOverrides = {};
    const config = await createRequestConfig(withRequestLocale(undefined));
    const messages = config.messages as { hero: { title: string } };
    expect(messages.hero.title).toBe("Learn Kirar for Orthodox chanting.");
  });
});
