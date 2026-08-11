import { describe, it, expect } from "vitest";
import { customizationOptionsSchema } from "@/lib/validations/customization-options";

type Json = Record<string, unknown>;

function selectField(overrides: Json = {}): Json {
  return {
    id: "shape",
    label: "Shape",
    type: "select",
    required: true,
    choices: [
      { id: "round", label: "Round", priceModifier: 0 },
      { id: "oval", label: "Oval", priceModifier: 500 },
    ],
    ...overrides,
  };
}

function swatchField(overrides: Json = {}): Json {
  return {
    id: "finish",
    label: "Finish",
    type: "swatch",
    required: true,
    choices: [{ id: "natural", label: "Natural", priceModifier: 0, hex: "#8B5A2B" }],
    ...overrides,
  };
}

function textField(overrides: Json = {}): Json {
  return {
    id: "engraving",
    label: "Engraving",
    type: "text",
    required: false,
    maxLength: 40,
    ...overrides,
  };
}

function imageSelectField(overrides: Json = {}): Json {
  return {
    id: "design",
    label: "Design",
    type: "image-select",
    required: true,
    choices: [{ id: "design-a", label: "Design A", priceModifier: 0, imageUrl: "https://example.com/a.png" }],
    ...overrides,
  };
}

describe("customizationOptionsSchema", () => {
  it("accepts a valid array with one field of each type", () => {
    const result = customizationOptionsSchema.safeParse([
      selectField(),
      swatchField(),
      textField(),
      imageSelectField(),
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts an empty array (a product with no customization options)", () => {
    expect(customizationOptionsSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate field ids", () => {
    const result = customizationOptionsSchema.safeParse([
      selectField({ id: "dup" }),
      swatchField({ id: "dup" }),
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate choice ids within one field", () => {
    const result = customizationOptionsSchema.safeParse([
      selectField({
        choices: [
          { id: "round", label: "Round", priceModifier: 0 },
          { id: "round", label: "Round Again", priceModifier: 0 },
        ],
      }),
    ]);
    expect(result.success).toBe(false);
  });

  it("allows the same choice id reused across different fields", () => {
    const result = customizationOptionsSchema.safeParse([
      selectField({ id: "shape", choices: [{ id: "a", label: "A", priceModifier: 0 }] }),
      swatchField({ id: "finish", choices: [{ id: "a", label: "A", priceModifier: 0, hex: "#000000" }] }),
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a swatch choice without a hex color", () => {
    const result = customizationOptionsSchema.safeParse([
      swatchField({ choices: [{ id: "natural", label: "Natural", priceModifier: 0 }] }),
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects an image-select choice without an imageUrl", () => {
    const result = customizationOptionsSchema.safeParse([
      imageSelectField({ choices: [{ id: "design-a", label: "Design A", priceModifier: 0 }] }),
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects a select field with an empty choices array", () => {
    expect(customizationOptionsSchema.safeParse([selectField({ choices: [] })]).success).toBe(false);
  });

  it("rejects a select field with choices omitted", () => {
    expect(customizationOptionsSchema.safeParse([selectField({ choices: undefined })]).success).toBe(false);
  });

  it("rejects a swatch field with an empty choices array", () => {
    expect(customizationOptionsSchema.safeParse([swatchField({ choices: [] })]).success).toBe(false);
  });

  it("rejects a swatch field with choices omitted", () => {
    expect(customizationOptionsSchema.safeParse([swatchField({ choices: undefined })]).success).toBe(false);
  });

  it("rejects an image-select field with an empty choices array", () => {
    expect(customizationOptionsSchema.safeParse([imageSelectField({ choices: [] })]).success).toBe(false);
  });

  it("rejects an image-select field with choices omitted", () => {
    expect(customizationOptionsSchema.safeParse([imageSelectField({ choices: undefined })]).success).toBe(false);
  });

  it("accepts a text field with no choices", () => {
    expect(customizationOptionsSchema.safeParse([textField()]).success).toBe(true);
  });

  it("accepts a text field with choices present (ignored, not validated)", () => {
    const result = customizationOptionsSchema.safeParse([
      textField({ choices: [{ id: "x", label: "X", priceModifier: 0 }] }),
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts a negative priceModifier", () => {
    const result = customizationOptionsSchema.safeParse([
      selectField({ choices: [{ id: "compact", label: "Compact", priceModifier: -1500 }] }),
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a non-integer priceModifier", () => {
    const result = customizationOptionsSchema.safeParse([
      selectField({ choices: [{ id: "round", label: "Round", priceModifier: 9.99 }] }),
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts exactly 20 fields", () => {
    const fields = Array.from({ length: 20 }, (_, i) => textField({ id: `field-${i}`, label: `Field ${i}` }));
    expect(customizationOptionsSchema.safeParse(fields).success).toBe(true);
  });

  it("rejects more than 20 fields", () => {
    const fields = Array.from({ length: 21 }, (_, i) => textField({ id: `field-${i}`, label: `Field ${i}` }));
    expect(customizationOptionsSchema.safeParse(fields).success).toBe(false);
  });

  it("accepts exactly 50 choices in one field", () => {
    const choices = Array.from({ length: 50 }, (_, i) => ({ id: `c-${i}`, label: `Choice ${i}`, priceModifier: 0 }));
    expect(customizationOptionsSchema.safeParse([selectField({ choices })]).success).toBe(true);
  });

  it("rejects more than 50 choices in one field", () => {
    const choices = Array.from({ length: 51 }, (_, i) => ({ id: `c-${i}`, label: `Choice ${i}`, priceModifier: 0 }));
    expect(customizationOptionsSchema.safeParse([selectField({ choices })]).success).toBe(false);
  });
});
