import { describe, expect, it } from "vitest";
import { safeAccountNextPath } from "./account-auth";

describe("safeAccountNextPath", () => {
  it("keeps a local account payment destination", () => {
    expect(safeAccountNextPath("/account/course-payments/pay-1")).toBe("/account/course-payments/pay-1");
  });

  it.each([undefined, null, "https://attacker.invalid", "//attacker.invalid", "/admin"])(
    "rejects unsafe login destinations",
    (value) => expect(safeAccountNextPath(value)).toBe("/courses"),
  );
});
