"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { customizationOptionsSchema } from "@/lib/validations/customization-options";
import { freezeId, randomKey } from "@/lib/customization-id";
import type {
  CustomizationField,
  CustomizationChoice,
  ProductCustomizationOptions,
} from "@/types/customization";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Accordion } from "@/components/ui/accordion";
import { CustomizationFieldEditor } from "@/components/admin/customization-field-editor";

// Editor-only identity, never sent to the server — React needs a stable key
// even before a field/choice has a real `id` (which stays "" until its
// label is first frozen; see freezeId in @/lib/customization-id).
export interface EditableChoice extends CustomizationChoice {
  _key: string;
}
export interface EditableField extends CustomizationField {
  _key: string;
  choices?: EditableChoice[];
}

function toEditableField(field: CustomizationField): EditableField {
  return {
    ...field,
    _key: randomKey(),
    choices: field.choices?.map((choice) => ({ ...choice, _key: randomKey() })),
  };
}

// Explicit field selection rather than destructure-and-discard the `_key`s —
// keeps this correct regardless of unused-var lint config, and only ever
// sends the shape the schema/route actually expect.
function toPlainField(field: EditableField): CustomizationField {
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    required: field.required,
    helpText: field.helpText,
    maxLength: field.maxLength,
    choices: field.choices?.map((choice) => ({
      id: choice.id,
      label: choice.label,
      priceModifier: choice.priceModifier,
      hex: choice.hex,
      imageUrl: choice.imageUrl,
    })),
  };
}

export function CustomizationOptionsEditor({
  productId,
  initialOptions,
}: {
  productId: string;
  initialOptions: ProductCustomizationOptions;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<EditableField[]>(() =>
    initialOptions.map(toEditableField)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAddField() {
    setFields((prev) => [
      ...prev,
      {
        _key: randomKey(),
        id: "",
        label: "",
        type: "select",
        required: false,
        choices: [],
      },
    ]);
  }

  function updateField(key: string, next: EditableField) {
    setFields((prev) => prev.map((f) => (f._key === key ? next : f)));
  }

  function removeField(key: string) {
    setFields((prev) => prev.filter((f) => f._key !== key));
  }

  function moveField(key: string, direction: -1 | 1) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f._key === key);
      const swapWith = idx + direction;
      if (idx < 0 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    // Safety net: freeze any field/choice id still unset before validating
    // (normally already frozen by the child editors on blur).
    const frozen = fields.map((field) => {
      const siblingFieldIds = fields
        .filter((f) => f._key !== field._key)
        .map((f) => f.id)
        .filter(Boolean);
      const choices = field.choices?.map((choice) => {
        const siblingChoiceIds = (field.choices ?? [])
          .filter((c) => c._key !== choice._key)
          .map((c) => c.id)
          .filter(Boolean);
        return { ...choice, id: freezeId(choice.id, choice.label, siblingChoiceIds) };
      });
      return {
        ...field,
        id: freezeId(field.id, field.label, siblingFieldIds),
        choices,
      };
    });
    setFields(frozen);

    // Friendly pre-check: an empty label is what an admin actually did
    // wrong. Without this, an unfrozen id (only possible when the label is
    // also empty) surfaces as zod's "Field id is required" — correct for
    // the schema, meaningless to someone who never typed an "id".
    const emptyField = frozen.find((f) => !f.label.trim());
    if (emptyField) {
      setError("Every field needs a label.");
      setSaving(false);
      return;
    }
    const emptyChoice = frozen.flatMap((f) => f.choices ?? []).find((c) => !c.label.trim());
    if (emptyChoice) {
      setError("Every choice needs a label.");
      setSaving(false);
      return;
    }

    const payload = frozen.map(toPlainField);
    const parsed = customizationOptionsSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/products/${productId}/customization-options`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setFields(
        (data.product.customizationOptions as ProductCustomizationOptions).map(toEditableField)
      );
      router.refresh();
    } catch (err) {
      console.error("[CustomizationOptionsEditor] save failed:", err);
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Accordion multiple defaultValue={[]} className="space-y-2">
        {fields.map((field, index) => (
          <CustomizationFieldEditor
            key={field._key}
            field={field}
            productId={productId}
            existingFieldIds={fields.filter((f) => f._key !== field._key).map((f) => f.id)}
            onChange={(next) => updateField(field._key, next)}
            onRemove={() => removeField(field._key)}
            onMoveUp={() => moveField(field._key, -1)}
            onMoveDown={() => moveField(field._key, 1)}
            canMoveUp={index > 0}
            canMoveDown={index < fields.length - 1}
          />
        ))}
      </Accordion>

      {fields.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No customization options yet — this product sells with no choices to make.
        </p>
      )}

      <Button type="button" variant="outline" onClick={handleAddField}>
        Add field
      </Button>

      <FieldError>{error}</FieldError>

      <div className="border-t border-border pt-4">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save customization options"}
        </Button>
      </div>
    </div>
  );
}
