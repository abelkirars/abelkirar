import { describe, expect, it } from "vitest";
import {
  getPracticeSelfRatingMessageKey,
  normalizePracticeSelfRating,
  PRACTICE_SELF_RATING_OPTIONS,
} from "@/lib/student/practice-self-ratings";

describe("practice self-rating options", () => {
  it("maps every stored suggestion to its student-facing message key", () => {
    for (const option of PRACTICE_SELF_RATING_OPTIONS) {
      expect(getPracticeSelfRatingMessageKey(option.value)).toBe(option.messageKey);
    }
  });

  it("leaves custom free-text ratings outside the suggestion mapping", () => {
    expect(getPracticeSelfRatingMessageKey("Calm but tired")).toBeNull();
    expect(getPracticeSelfRatingMessageKey(null)).toBeNull();
  });

  it("keeps stored suggestion values unique", () => {
    const values = PRACTICE_SELF_RATING_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("normalizes a localized suggestion back to its stable stored value", () => {
    const labels = new Map([
      ["practiceSelfRatings.focused", "ትኩረት ያለው"],
      ["practiceSelfRatings.rushed", "በችኮላ"],
    ]);

    expect(
      normalizePracticeSelfRating("ትኩረት ያለው", (key) => labels.get(key) ?? key),
    ).toBe("Focused");
  });

  it("preserves custom free text during normalization", () => {
    expect(normalizePracticeSelfRating("Calm but tired", (key) => key)).toBe(
      "Calm but tired",
    );
  });
});
