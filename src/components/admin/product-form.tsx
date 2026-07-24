"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRODUCT_CATEGORIES } from "@/lib/validations/product";
import { categoryLabel } from "@/lib/category-gradients";

export function ProductForm({
  product,
  onDone,
}: {
  product?: Product;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>(product?.category ?? "KIRAR");
  const [isCustomMade, setIsCustomMade] = useState(product?.isCustomMade ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("category", category);
    const publishedInput = form.elements.namedItem("published") as HTMLInputElement;
    formData.set("published", String(publishedInput.checked));
    formData.set("isCustomMade", String(isCustomMade));

    try {
      const res = await fetch(
        product ? `/api/admin/products/${product.id}` : "/api/admin/products",
        { method: product ? "PATCH" : "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.refresh();
      if (!product) form.reset();
      onDone?.();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field orientation="responsive">
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <Input id="name" name="name" defaultValue={product?.name} required />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="variantName">Variant name (optional)</FieldLabel>
        <Input
          id="variantName"
          name="variantName"
          placeholder="e.g. Desalegn Kirar"
          defaultValue={product?.variantName ?? ""}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <Textarea id="description" name="description" defaultValue={product?.description} required />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="category">Category</FieldLabel>
        <Select value={category} onValueChange={(value) => setCategory(value as string)}>
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {categoryLabel(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="price">Price (USD)</FieldLabel>
        <Input
          id="price"
          name="price"
          type="number"
          min={0}
          step="0.01"
          defaultValue={product ? (product.basePrice / 100).toFixed(2) : undefined}
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="images">
          {product ? "Replace images (optional)" : "Images (optional)"}
        </FieldLabel>
        <Input
          id="images"
          name="images"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
        />
      </Field>

      <Field orientation="horizontal">
        <input
          id="published"
          name="published"
          type="checkbox"
          defaultChecked={product?.isActive ?? true}
          className="size-4 rounded border-input"
        />
        <FieldLabel htmlFor="published" className="font-normal">
          Published (visible in the public store)
        </FieldLabel>
      </Field>

      <Field orientation="horizontal">
        <input
          id="isCustomMade"
          type="checkbox"
          checked={isCustomMade}
          onChange={(e) => setIsCustomMade(e.target.checked)}
          className="size-4 rounded border-input"
        />
        <FieldLabel htmlFor="isCustomMade" className="font-normal">
          Custom made (also available as a custom order)
        </FieldLabel>
      </Field>

      {isCustomMade && (
        <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
          <Field>
            <FieldLabel htmlFor="customMadeDetails">Custom order details</FieldLabel>
            <Textarea
              id="customMadeDetails"
              name="customMadeDetails"
              placeholder="e.g. Customer can request custom dimensions, wood finish, engraving, etc."
              defaultValue={product?.customMadeDetails ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="customMadeImage">
              {product?.customMadeImageUrl
                ? "Replace reference image (optional)"
                : "Reference image (optional)"}
            </FieldLabel>
            <Input
              id="customMadeImage"
              name="customMadeImage"
              type="file"
              accept="image/png,image/jpeg,image/webp"
            />
          </Field>
        </div>
      )}

      <FieldError>{error}</FieldError>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : product ? "Save changes" : "Add product"}
        </Button>
        {product && onDone && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
