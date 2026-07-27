import { describe, it, expect, vi } from "vitest";
import { isValidE164, parseRecipientList, maskPhone } from "@/lib/phone";

describe("isValidE164", () => {
  it("accepts valid E.164 numbers", () => {
    expect(isValidE164("+15551234567")).toBe(true);
    expect(isValidE164("+251911234567")).toBe(true);
  });

  it("rejects numbers without a leading +", () => {
    expect(isValidE164("15551234567")).toBe(false);
  });

  it("rejects numbers starting with 0 after the +", () => {
    expect(isValidE164("+05551234567")).toBe(false);
  });

  it("rejects too-short or too-long numbers", () => {
    expect(isValidE164("+1234")).toBe(false);
    expect(isValidE164("+1234567890123456")).toBe(false);
  });

  it("rejects non-numeric garbage", () => {
    expect(isValidE164("whatsapp:+15551234567")).toBe(false);
    expect(isValidE164("+1555abc4567")).toBe(false);
  });
});

describe("parseRecipientList", () => {
  it("returns an empty array for undefined input", () => {
    expect(parseRecipientList(undefined, "SMS")).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseRecipientList("", "SMS")).toEqual([]);
  });

  it("parses a comma-separated list, trimming whitespace", () => {
    expect(parseRecipientList(" +15551234567 , +251911234567 ", "SMS")).toEqual([
      "+15551234567",
      "+251911234567",
    ]);
  });

  it("drops invalid entries without throwing, keeping the valid ones", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseRecipientList("+15551234567,not-a-number", "SMS")).toEqual(["+15551234567"]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("never throws even when every entry is invalid", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => parseRecipientList("garbage,also-garbage", "WhatsApp")).not.toThrow();
    expect(parseRecipientList("garbage,also-garbage", "WhatsApp")).toEqual([]);
    warnSpy.mockRestore();
  });
});

describe("maskPhone", () => {
  it("masks a US number, keeping the country code and last 2 digits", () => {
    const masked = maskPhone("+15551234567");
    expect(masked.startsWith("+1")).toBe(true);
    expect(masked.endsWith("67")).toBe(true);
    expect(masked).not.toContain("5551234");
  });

  it("masks a longer international number", () => {
    const masked = maskPhone("+251911234567");
    expect(masked.endsWith("67")).toBe(true);
    expect(masked).not.toContain("911234");
  });

  it("returns a fixed placeholder for very short strings", () => {
    expect(maskPhone("+123")).toBe("***");
  });

  it("never crashes on an empty string", () => {
    expect(() => maskPhone("")).not.toThrow();
  });
});
