import { describe, expect, it } from "vitest";
import { parseCoursePaymentProofFields } from "./course-payment-proof-input";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = {
  method: "ZELLE",
  senderName: "Sender",
  amountSent: "50.00",
  sentAt: "2026-10-12T11:00:00.000Z",
  transactionReference: "reference",
};

describe("course payment proof fields", () => {
  it("converts a reported decimal amount to exact cents", () => {
    expect(parseCoursePaymentProofFields(form(valid))).toEqual({
      method: "ZELLE",
      senderName: "Sender",
      amountSentCents: 5000,
      sentAt: new Date("2026-10-12T11:00:00.000Z"),
      transactionReference: "reference",
    });
  });

  it.each([
    [{ ...valid, method: "CARD" }, "Invalid"],
    [{ ...valid, amountSent: "50.001" }, "two decimal"],
    [{ ...valid, amountSent: "0" }, "greater than zero"],
    [{ ...valid, sentAt: "not-a-date" }, "Invalid"],
  ])("rejects malformed or unsupported submission fields", (values, message) => {
    expect(() => parseCoursePaymentProofFields(form(values))).toThrow(message);
  });
});
