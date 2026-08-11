"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { freezeId } from "@/lib/customization-id";
import type { EditableChoice } from "@/components/admin/customization-options-editor";
import type { CustomizationFieldType } from "@/types/customization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

export function CustomizationChoiceEditor({
  choice,
  productId,
  fieldType,
  existingChoiceIds,
  onChange,
  onRemove,
}: {
  choice: EditableChoice;
  productId: string;
  fieldType: CustomizationFieldType;
  existingChoiceIds: string[];
  onChange: (next: EditableChoice) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const [priceInput, setPriceInput] = useState(() => (choice.priceModifier / 100).toFixed(2));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function handleLabelBlur() {
    if (choice.id) return; // already frozen
    const id = freezeId(choice.id, choice.label, existingChoiceIds);
    if (id) onChange({ ...choice, id });
  }

  // priceInput is the source of truth while typing — it can transiently
  // hold "", "-", "1." etc. that don't represent a real value yet. Only a
  // non-empty string that parses to a finite number ever gets committed to
  // priceModifier; Number("") === 0, so without the non-empty check,
  // clearing the field to retype would silently zero out a real price
  // adjustment.
  function handlePriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setPriceInput(raw);
    if (raw.trim() === "") return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      onChange({ ...choice, priceModifier: Math.round(parsed * 100) });
    }
  }

  // On blur, if what's left in the box isn't a valid committed value
  // (empty, or something like "-" that never parsed), snap the display
  // back to the last real priceModifier rather than leaving it blank or
  // stale-looking.
  function handlePriceBlur() {
    const parsed = Number(priceInput);
    if (priceInput.trim() === "" || !Number.isFinite(parsed)) {
      setPriceInput((choice.priceModifier / 100).toFixed(2));
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after a failed/changed upload
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.set("image", file);
      const res = await fetch(`/api/admin/products/${productId}/customization-choice-image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
        return;
      }
      onChange({ ...choice, imageUrl: data.url });
    } catch (err) {
      console.error("[CustomizationChoiceEditor] image upload failed:", err);
      setUploadError("Upload failed, please try again");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-border/60 bg-background p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Field orientation="responsive">
          <FieldLabel htmlFor={`${uid}-label`}>Label</FieldLabel>
          <Input
            id={`${uid}-label`}
            value={choice.label}
            onChange={(e) => onChange({ ...choice, label: e.target.value })}
            onBlur={handleLabelBlur}
            placeholder="e.g. Natural"
            required
          />
        </Field>

        <Field orientation="responsive">
          <FieldLabel htmlFor={`${uid}-price`}>Price adjustment (USD)</FieldLabel>
          <Input
            id={`${uid}-price`}
            type="number"
            step="0.01"
            value={priceInput}
            onChange={handlePriceChange}
            onBlur={handlePriceBlur}
          />
        </Field>

        {fieldType === "swatch" && (
          <Field orientation="horizontal">
            <FieldLabel htmlFor={`${uid}-hex`}>Color</FieldLabel>
            <input
              type="color"
              value={choice.hex ?? "#000000"}
              onChange={(e) => onChange({ ...choice, hex: e.target.value })}
              className="h-9 w-12 shrink-0 cursor-pointer rounded border border-input bg-transparent p-1"
              aria-label="Pick a color"
            />
            <Input
              id={`${uid}-hex`}
              value={choice.hex ?? ""}
              onChange={(e) => onChange({ ...choice, hex: e.target.value })}
              placeholder="#8B5A2B"
              className="w-28"
              required
            />
          </Field>
        )}

        {fieldType === "image-select" && (
          <Field>
            <FieldLabel htmlFor={`${uid}-image`}>Image</FieldLabel>
            {choice.imageUrl && (
              <div className="relative mb-2 aspect-square w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
                <Image src={choice.imageUrl} alt="" fill className="object-cover" />
                <button
                  type="button"
                  onClick={() => onChange({ ...choice, imageUrl: undefined })}
                  aria-label="Remove image"
                  className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
            <Input
              id={`${uid}-image`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageChange}
              disabled={uploading}
              required={!choice.imageUrl}
            />
            {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          </Field>
        )}
      </div>

      <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
