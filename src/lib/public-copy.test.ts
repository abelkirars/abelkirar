import { describe, expect, it } from "vitest";
import englishMessages from "../../messages/en.json";

describe("public introduction copy", () => {
  it("uses Orthodox chanting language on the main marketing pages", () => {
    const introduction = JSON.stringify({
      hero: englishMessages.hero,
      mission: englishMessages.mission,
      home: englishMessages.home,
      courseLevels: englishMessages.courseLevels,
      community: englishMessages.community,
      about: englishMessages.about,
      footer: englishMessages.footer,
    });

    expect(introduction).toMatch(/Orthodox chanting/);
    expect(introduction).not.toMatch(/\bmusic(?:al|ian|ians)?\b/i);
    expect(introduction).not.toMatch(/modernize|fall flat|carry the tradition/i);
  });

  it("gives visitors both lesson actions requested by Deacon Abel", () => {
    expect(englishMessages.hero.startLearning).toBe("Start Learning");
    expect(englishMessages.hero.contactAbel).toBe("Contact Deacon Abel");
  });
});
