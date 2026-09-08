import { describe, it, expect } from "vitest";
import { StudentLevel } from "@prisma/client";
import { COURSE_LEVELS } from "@/lib/courses-data";
import { createCourseApplicationSchema } from "@/lib/validations/course-application";

// StudentLevel is imported as a VALUE here, not a type — this file runs in
// node (a Vitest unit test), not a browser bundle, so that's safe. The
// type-only import in courses-data.ts itself is the one that's load-bearing.

describe("COURSE_LEVELS studentLevel mapping", () => {
  it("maps each course to its declared StudentLevel, looked up by slug", () => {
    // Looked up by slug rather than by array index, so reordering
    // COURSE_LEVELS can't make this pass or fail spuriously.
    const bySlug = Object.fromEntries(COURSE_LEVELS.map((c) => [c.slug, c]));

    expect(bySlug.beginner?.studentLevel).toBe("BEGINNER");
    expect(bySlug.intermediate?.studentLevel).toBe("INTERMEDIATE");
    expect(bySlug.advanced?.studentLevel).toBe("ADVANCED");
  });
});

/**
 * Drift guard, not a courses-data test in spirit — it lives in this file
 * only to stay inside this task's authorized file list. What it actually
 * proves: the three StudentLevel values now exist in four independent,
 * hand-written places (prisma/schema.prisma, the Zod schema in
 * src/lib/validations/course-application.ts, the studentLevel literals in
 * this module, and the <option> values in course-application-form.tsx),
 * and nothing in the type system connects the Zod schema to the Prisma
 * enum. This test fails the moment those two specifically drift apart.
 *
 * Uses safeParse against a full valid input object rather than
 * introspecting the schema's internal shape — the schema's requestedLevel
 * field is z.enum([...]).optional(), and reaching a ZodEnum's .options
 * array through an object field wrapped in .optional() requires unwrapping
 * version-specific internals. Parsing a real object is version-independent
 * and proves the identical thing: does the schema accept this value.
 */
describe("StudentLevel / course-application Zod schema alignment (drift guard)", () => {
  const t = (key: string) => key;
  const schema = createCourseApplicationSchema(t);
  // A complete valid application, so this guard fails only on a genuine level
  // drift rather than on any unrelated field becoming required.
  const baseInput = {
    fullName: "Jane Doe",
    country: "Ethiopia",
    isUnder15: false,
    email: "jane@example.com",
    lessonLanguage: "AM",
    kirarModel: "FIVE_STRING",
  };

  it("accepts every current Prisma StudentLevel value as requestedLevel", () => {
    for (const level of Object.values(StudentLevel)) {
      const result = schema.safeParse({ ...baseInput, requestedLevel: level });
      expect(result.success, `expected requestedLevel "${level}" to be accepted`).toBe(true);
    }
  });

  it("rejects a requestedLevel value that is not a current StudentLevel", () => {
    const result = schema.safeParse({ ...baseInput, requestedLevel: "NOT_A_REAL_LEVEL" });
    expect(result.success).toBe(false);
  });
});
