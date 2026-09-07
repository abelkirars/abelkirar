import { describe, it, expect } from "vitest";
import { StudentLevel } from "@prisma/client";
import {
  createCourseApplicationSchema,
  normalizeOptionalFields,
  toRequestedLevel,
  REQUESTED_LEVEL_CHOICES,
} from "@/lib/validations/course-application";

// Messages are returned as their own keys, so assertions name the message key
// rather than a translated string that Abel may reword at any time.
const t = (key: string) => key;
const schema = createCourseApplicationSchema(t);

const adult = {
  fullName: "Jane Doe",
  country: "Ethiopia",
  isUnder15: false,
  email: "jane@example.com",
  phone: "+251900000000",
  lessonLanguage: "AM",
  requestedLevel: "BEGINNER",
  kirarModel: "FIVE_STRING",
};

const child = {
  ...adult,
  isUnder15: true,
  guardianName: "Parent Name",
  guardianRelationship: "Parent",
  guardianPhone: "+251911111111",
  guardianConsent: true,
};

/** Message keys reported against a given field path. */
function issuesFor(result: ReturnType<typeof schema.safeParse>, path: string): string[] {
  if (result.success) return [];
  return result.error.issues.filter((i) => i.path[0] === path).map((i) => i.message);
}

describe("course application validation", () => {
  it("accepts a complete application from someone 15 or over", () => {
    expect(schema.safeParse(adult).success).toBe(true);
  });

  it("accepts a complete under-15 application", () => {
    expect(schema.safeParse(child).success).toBe(true);
  });

  describe("required questions", () => {
    it.each(["country", "isUnder15", "lessonLanguage", "requestedLevel", "kirarModel"])(
      "rejects an application missing %s",
      (field) => {
        const input: Record<string, unknown> = { ...adult };
        delete input[field];
        const result = schema.safeParse(input);
        expect(result.success).toBe(false);
        expect(issuesFor(result, field).length).toBeGreaterThan(0);
      }
    );

    it("rejects an empty level selection rather than treating it as 'not sure'", () => {
      const result = schema.safeParse({ ...adult, requestedLevel: "" });
      expect(result.success).toBe(false);
      expect(issuesFor(result, "requestedLevel")).toContain("selectLevel");
    });
  });

  describe("'not sure yet' level", () => {
    it("accepts UNSURE as an explicit answer", () => {
      expect(schema.safeParse({ ...adult, requestedLevel: "UNSURE" }).success).toBe(true);
    });

    it("maps UNSURE to null and never to a real level", () => {
      expect(toRequestedLevel("UNSURE")).toBeNull();
    });

    it.each(["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const)("maps %s to itself", (level) => {
      expect(toRequestedLevel(level)).toBe(level);
    });
  });

  describe("guardian block — enforced on the server, not just hidden in the browser", () => {
    it("requires all four guardian answers when the student is under 15", () => {
      const result = schema.safeParse({ ...adult, isUnder15: true });
      expect(result.success).toBe(false);
      expect(issuesFor(result, "guardianName")).toContain("enterGuardianName");
      expect(issuesFor(result, "guardianRelationship")).toContain("selectGuardianRelationship");
      expect(issuesFor(result, "guardianPhone")).toContain("enterGuardianPhone");
      expect(issuesFor(result, "guardianConsent")).toContain("guardianConsentRequired");
    });

    it.each(["guardianName", "guardianRelationship", "guardianPhone"])(
      "rejects an under-15 application missing %s",
      (field) => {
        const input: Record<string, unknown> = { ...child };
        delete input[field];
        const result = schema.safeParse(input);
        expect(result.success).toBe(false);
        expect(issuesFor(result, field).length).toBeGreaterThan(0);
      }
    );

    it("rejects an under-15 application where consent is not ticked", () => {
      const result = schema.safeParse({ ...child, guardianConsent: false });
      expect(result.success).toBe(false);
      expect(issuesFor(result, "guardianConsent")).toContain("guardianConsentRequired");
    });

    it("does not accept an arbitrary relationship value", () => {
      expect(schema.safeParse({ ...child, guardianRelationship: "Teacher" }).success).toBe(false);
    });

    it("accepts an application from someone 15 or over that carries stale guardian keys", () => {
      // Rejecting these would turn a harmless leftover field into a failed
      // submission; the write layer nulls them instead.
      expect(schema.safeParse({ ...adult, guardianName: "Someone" }).success).toBe(true);
    });

    it("never accepts a client-supplied consent timestamp", () => {
      const result = schema.safeParse({ ...child, guardianConsentAt: "2020-01-01T00:00:00.000Z" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("guardianConsentAt");
      }
    });
  });

  describe("normalizeOptionalFields", () => {
    it("turns empty optional strings into undefined", () => {
      const out = normalizeOptionalFields({ phone: "   ", applicantMessage: "", guardianName: "" });
      expect(out.phone).toBeUndefined();
      expect(out.applicantMessage).toBeUndefined();
      expect(out.guardianName).toBeUndefined();
    });

    it("leaves the required choice fields alone so an empty selection fails validation", () => {
      const out = normalizeOptionalFields({
        requestedLevel: "",
        lessonLanguage: "",
        kirarModel: "",
      });
      expect(out.requestedLevel).toBe("");
      expect(out.lessonLanguage).toBe("");
      expect(out.kirarModel).toBe("");
    });
  });

  describe("drift guard against the Prisma StudentLevel enum", () => {
    it("offers every StudentLevel value as a wire choice, plus UNSURE", () => {
      for (const level of Object.values(StudentLevel)) {
        expect(REQUESTED_LEVEL_CHOICES).toContain(level);
        expect(schema.safeParse({ ...adult, requestedLevel: level }).success).toBe(true);
      }
      expect(REQUESTED_LEVEL_CHOICES).toContain("UNSURE");
      expect(REQUESTED_LEVEL_CHOICES).toHaveLength(Object.values(StudentLevel).length + 1);
    });
  });
});
