import { describe, expect, it } from "vitest";
import { courseOverviewItems, coursePlanItems } from "./courses-data";
import { applyOverrides } from "./site-copy-keys";
import en from "../../messages/en.json";
import am from "../../messages/am.json";

describe("editable public course overviews", () => {
  it("shows the supplied plan for Beginner and hides empty plans for the other levels", () => {
    expect(coursePlanItems((field) => en.courseDetails.beginner[field])).toHaveLength(3);
    expect(coursePlanItems((field) => en.courseDetails.intermediate[field])).toHaveLength(0);
    expect(coursePlanItems((field) => en.courseDetails.advanced[field])).toHaveLength(0);
  });
  it.each([en, am])("keeps the original three items until the admin adds more", (messages) => {
    const copy = messages.courseDetails.beginner as Record<string, string>;
    expect(courseOverviewItems((slot) => copy[`topic${slot}`])).toHaveLength(3);
  });
  it("renders additional saved items, hides removed items, and isolates the course", () => {
    const merged = applyOverrides(en, {
      "courseDetails.beginner.topic4": "A fourth public overview point",
      "courseDetails.beginner.topic50": "Another point",
      "courseDetails.beginner.topic2": "",
    }) as typeof en;
    const beginner = merged.courseDetails.beginner as Record<string, string>;
    const intermediate = merged.courseDetails.intermediate as Record<string, string>;
    expect(courseOverviewItems((slot) => beginner[`topic${slot}`]).map((item) => item.slot)).toEqual([1, 3, 4, 50]);
    expect(courseOverviewItems((slot) => intermediate[`topic${slot}`])).toHaveLength(3);
    expect(en.courseDetails.beginner.topic4).toBe("");
  });
});
