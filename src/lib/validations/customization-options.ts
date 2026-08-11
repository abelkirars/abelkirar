import { z } from "zod";

const FIELD_TYPES = ["select", "swatch", "text", "image-select"] as const;

// This route accepts an arbitrary array and writes it to a column that
// renders on a public product page — no real product needs more than this,
// and without a cap a bad paste writes thousands of entries that then
// render for customers. Cheap insurance, no downside.
const MAX_FIELDS = 20;
const MAX_CHOICES_PER_FIELD = 50;

const customizationChoiceSchema = z.object({
  id: z.string().min(1, "Choice id is required"),
  label: z.string().min(1, "Choice label is required"),
  // Integer cents, added to the product's base price — may be negative
  // (a cheaper option than the default), matching the existing seed data
  // (the "compact" size choice is -1500).
  priceModifier: z.number().int("Price modifier must be a whole number of cents"),
  hex: z.string().min(1).optional(),
  imageUrl: z.string().min(1).optional(),
});

const customizationFieldSchema = z
  .object({
    id: z.string().min(1, "Field id is required"),
    label: z.string().min(1, "Field label is required"),
    type: z.enum(FIELD_TYPES),
    required: z.boolean(),
    helpText: z.string().optional(),
    choices: z
      .array(customizationChoiceSchema)
      .max(MAX_CHOICES_PER_FIELD, `A field can have at most ${MAX_CHOICES_PER_FIELD} choices`)
      .optional(),
    // Only meaningful when type is "text" — harmless if set on any other
    // field type, same as choices being present-but-unused on a "text"
    // field below; neither is worth rejecting outright.
    maxLength: z.number().int().positive().optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === "text") return; // choices are meaningless here — ignored, not rejected

    if (!field.choices || field.choices.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: `"${field.label || field.id}" needs at least one choice for a ${field.type} field`,
        path: ["choices"],
      });
      return;
    }

    const seenChoiceIds = new Set<string>();
    field.choices.forEach((choice, index) => {
      if (seenChoiceIds.has(choice.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate choice id "${choice.id}" in field "${field.label || field.id}"`,
          path: ["choices", index, "id"],
        });
      }
      seenChoiceIds.add(choice.id);

      if (field.type === "swatch" && !choice.hex) {
        ctx.addIssue({
          code: "custom",
          message: `Choice "${choice.label || choice.id}" needs a hex color for a swatch field`,
          path: ["choices", index, "hex"],
        });
      }

      if (field.type === "image-select" && !choice.imageUrl) {
        ctx.addIssue({
          code: "custom",
          message: `Choice "${choice.label || choice.id}" needs an image for an image-select field`,
          path: ["choices", index, "imageUrl"],
        });
      }
    });
  });

export const customizationOptionsSchema = z
  .array(customizationFieldSchema)
  .max(MAX_FIELDS, `A product can have at most ${MAX_FIELDS} customization fields`)
  .superRefine((fields, ctx) => {
    const seenFieldIds = new Set<string>();
    fields.forEach((field, index) => {
      if (seenFieldIds.has(field.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate field id "${field.id}"`,
          path: [index, "id"],
        });
      }
      seenFieldIds.add(field.id);
    });
  });

export type CustomizationOptionsInput = z.infer<typeof customizationOptionsSchema>;
