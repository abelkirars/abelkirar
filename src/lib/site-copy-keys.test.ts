import { describe, it, expect } from "vitest";
import englishMessages from "../../messages/en.json";
import amharicMessages from "../../messages/am.json";
import {
  applyOverrides,
  flattenMessages,
  messagePlaceholders,
  placeholderDrift,
} from "@/lib/site-copy-keys";

describe("flattenMessages", () => {
  it("addresses every leaf string by its dot path", () => {
    const flat = flattenMessages({ about: { paragraph1: "one", nested: { deep: "two" } } });
    expect(flat).toEqual({ "about.paragraph1": "one", "about.nested.deep": "two" });
  });

  it("skips values that are neither objects nor strings, rather than coercing them", () => {
    const flat = flattenMessages({ a: "text", b: 3, c: null, d: ["x"] });
    expect(Object.keys(flat)).toEqual(["a"]);
  });

  it("covers the real messages files, and both locales expose the same keys", () => {
    const en = flattenMessages(englishMessages);
    const am = flattenMessages(amharicMessages);
    expect(Object.keys(en).length).toBeGreaterThan(300);
    // The editor shows English and Amharic side by side against one key list.
    // A key present in one file and not the other would render an editable
    // box whose edits the other locale could never receive.
    expect(Object.keys(am).sort()).toEqual(Object.keys(en).sort());
  });
});

describe("applyOverrides", () => {
  const defaults = { about: { paragraph1: "default one", paragraph2: "default two" } };

  it("replaces only the overridden leaf", () => {
    const merged = applyOverrides(defaults, { "about.paragraph1": "edited" });
    expect(merged).toEqual({ about: { paragraph1: "edited", paragraph2: "default two" } });
  });

  it("never mutates the defaults it was handed", () => {
    // The imported JSON module object is shared across every request in a warm
    // serverless instance. Mutating it would leak one visitor's copy into
    // everyone else's.
    const frozenView = JSON.stringify(defaults);
    applyOverrides(defaults, { "about.paragraph1": "edited" });
    expect(JSON.stringify(defaults)).toBe(frozenView);
  });

  it("ignores a key whose path does not exist in the defaults", () => {
    const merged = applyOverrides(defaults, { "about.paragraph9": "orphan" });
    expect(merged).toEqual(defaults);
  });

  it("ignores a key whose path runs through a string", () => {
    const merged = applyOverrides(defaults, { "about.paragraph1.deeper": "nonsense" });
    expect(merged).toEqual(defaults);
  });

  it("refuses to overwrite an object node with a string", () => {
    // Otherwise one bad row could replace a whole namespace and make every
    // t() call inside it throw.
    const merged = applyOverrides(defaults, { about: "flattened" });
    expect(merged).toEqual(defaults);
  });

  it("returns the defaults untouched when there is nothing to apply", () => {
    const merged = applyOverrides(defaults, {});
    expect(merged).toEqual(defaults);
    expect(merged).not.toBe(defaults);
    expect(merged.about).not.toBe(defaults.about);
  });

  it("deep-clones frozen defaults and never leaks edits into later calls or another locale", () => {
    const en = Object.freeze({ section: Object.freeze({ nested: Object.freeze({ title: "Original" }) }) });
    const am = Object.freeze({ section: Object.freeze({ nested: Object.freeze({ title: "መነሻ" }) }) });
    const before = structuredClone(en);
    const merged = applyOverrides(en, { "section.nested.title": "Edited" });
    expect(merged).toEqual({ section: { nested: { title: "Edited" } } });
    expect(en).toEqual(before);
    expect(merged.section).not.toBe(en.section);
    expect(applyOverrides(en, {})).toEqual(before);
    expect(applyOverrides(am, {})).toEqual(am);
  });
});

describe("messagePlaceholders", () => {
  it("finds simple arguments", () => {
    expect(messagePlaceholders("Order {orderNumber} for {total}")).toEqual([
      "orderNumber",
      "total",
    ]);
  });

  it("finds the argument name of a typed placeholder", () => {
    expect(messagePlaceholders("{count, plural, one {# item} other {# items}}")).toEqual([
      "count",
    ]);
  });

  it("returns nothing for a message with no arguments", () => {
    expect(messagePlaceholders("Start Learning")).toEqual([]);
  });
});

describe("placeholderDrift", () => {
  it("passes an edit that keeps every placeholder", () => {
    expect(placeholderDrift("Order {orderNumber}", "Your order, {orderNumber}")).toBeNull();
  });

  it("catches a dropped placeholder", () => {
    // This is the one edit that takes a page down: next-intl throws rather
    // than rendering a message whose arguments do not line up.
    expect(placeholderDrift("Order {orderNumber}", "Your order")).toEqual({
      missing: ["orderNumber"],
      unexpected: [],
    });
  });

  it("catches an invented placeholder", () => {
    expect(placeholderDrift("Hello {fullName}", "Hello {firstName}")).toEqual({
      missing: ["fullName"],
      unexpected: ["firstName"],
    });
  });

  it("does not care about order or repetition", () => {
    expect(placeholderDrift("{a} {b}", "{b}, {a}, and {a} again")).toBeNull();
  });
});
