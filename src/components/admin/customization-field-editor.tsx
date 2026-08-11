"use client";

import { useId } from "react";
import { freezeId, randomKey } from "@/lib/customization-id";
import type { EditableField, EditableChoice } from "@/components/admin/customization-options-editor";
import type { CustomizationFieldType } from "@/types/customization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { CustomizationChoiceEditor } from "@/components/admin/customization-choice-editor";

const FIELD_TYPE_LABELS: Record<CustomizationFieldType, string> = {
  select: "Select (buttons)",
  swatch: "Swatch (color)",
  text: "Text (free entry, e.g. engraving)",
  "image-select": "Image select (photo picker)",
};

const FIELD_TYPES = Object.keys(FIELD_TYPE_LABELS) as CustomizationFieldType[];

export function CustomizationFieldEditor({
  field,
  productId,
  existingFieldIds,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  field: EditableField;
  productId: string;
  existingFieldIds: string[];
  onChange: (next: EditableField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const uid = useId();
  const showsChoices = field.type !== "text";

  function handleLabelBlur() {
    if (field.id) return; // already frozen
    const id = freezeId(field.id, field.label, existingFieldIds);
    if (id) onChange({ ...field, id });
  }

  function addChoice() {
    onChange({
      ...field,
      choices: [
        ...(field.choices ?? []),
        { _key: randomKey(), id: "", label: "", priceModifier: 0 },
      ],
    });
  }

  function updateChoice(key: string, next: EditableChoice) {
    onChange({
      ...field,
      choices: (field.choices ?? []).map((c) => (c._key === key ? next : c)),
    });
  }

  function removeChoice(key: string) {
    onChange({
      ...field,
      choices: (field.choices ?? []).filter((c) => c._key !== key),
    });
  }

  const existingChoiceIds = (field.choices ?? []).map((c) => c.id);

  return (
    <AccordionItem value={field._key} className="rounded-lg border border-border px-3">
      <AccordionTrigger>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{field.label || "Untitled field"}</span>
          <Badge variant="outline">{FIELD_TYPE_LABELS[field.type]}</Badge>
          {field.required && <span className="text-xs text-muted-foreground">Required</span>}
        </span>
      </AccordionTrigger>

      <AccordionContent>
        <div className="space-y-4 pt-1">
          <Field orientation="responsive">
            <FieldLabel htmlFor={`${uid}-label`}>Label</FieldLabel>
            <Input
              id={`${uid}-label`}
              value={field.label}
              onChange={(e) => onChange({ ...field, label: e.target.value })}
              onBlur={handleLabelBlur}
              placeholder="e.g. Shape"
              required
            />
          </Field>

          <Field orientation="responsive">
            <FieldLabel htmlFor={`${uid}-type`}>Type</FieldLabel>
            <Select
              value={field.type}
              onValueChange={(value) =>
                onChange({ ...field, type: value as CustomizationFieldType })
              }
            >
              <SelectTrigger id={`${uid}-type`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {FIELD_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal">
            <input
              id={`${uid}-required`}
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ ...field, required: e.target.checked })}
              className="size-4 rounded border-input"
            />
            <FieldLabel htmlFor={`${uid}-required`} className="font-normal">
              Required — customer must choose before adding to cart
            </FieldLabel>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${uid}-helpText`}>Help text (optional)</FieldLabel>
            <Input
              id={`${uid}-helpText`}
              value={field.helpText ?? ""}
              onChange={(e) => onChange({ ...field, helpText: e.target.value })}
              placeholder="Shown under the field on the product page"
            />
          </Field>

          {field.type === "text" && (
            <Field orientation="responsive">
              <FieldLabel htmlFor={`${uid}-maxLength`}>Max length (optional)</FieldLabel>
              <Input
                id={`${uid}-maxLength`}
                type="number"
                min={1}
                value={field.maxLength ?? ""}
                onChange={(e) =>
                  onChange({
                    ...field,
                    maxLength: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </Field>
          )}

          {showsChoices && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-sm font-medium">Choices</p>
              {(field.choices ?? []).map((choice) => (
                <CustomizationChoiceEditor
                  key={choice._key}
                  choice={choice}
                  productId={productId}
                  fieldType={field.type}
                  existingChoiceIds={existingChoiceIds.filter((id) => id !== choice.id)}
                  onChange={(next) => updateChoice(choice._key, next)}
                  onRemove={() => removeChoice(choice._key)}
                />
              ))}
              <Button type="button" size="sm" variant="outline" onClick={addChoice}>
                Add choice
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <Button type="button" size="sm" variant="outline" disabled={!canMoveUp} onClick={onMoveUp}>
              Move up
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canMoveDown}
              onClick={onMoveDown}
            >
              Move down
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={onRemove}>
              Remove field
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
