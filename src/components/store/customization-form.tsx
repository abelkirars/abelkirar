"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type {
  ProductCustomizationOptions,
  SelectedCustomization,
} from "@/types/customization";
import { computeUnitPrice } from "@/lib/pricing";
import { useCartStore } from "@/store/cart-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Types the four dedicated rendering branches below recognize. Anything
// else falls back to plain choice buttons rather than rendering nothing —
// deliberately NOT typed as CustomizationFieldType[], so this stays a real
// runtime check against arbitrary stored data instead of something
// TypeScript could "prove" is always true from the type alone.
const KNOWN_FIELD_TYPES = ["select", "swatch", "text", "image-select"];

interface Props {
  product: {
    id: string;
    slug: string;
    name: string;
    basePrice: number;
    images: string[];
    customizationOptions: ProductCustomizationOptions;
  };
  onSelectImage?: (image: string) => void;
}

export function CustomizationForm({ product, onSelectImage }: Props) {
  const t = useTranslations("product");
  const addItem = useCartStore((s) => s.addItem);
  const [selected, setSelected] = useState<SelectedCustomization>(() => {
    const defaults: SelectedCustomization = {};
    for (const field of product.customizationOptions) {
      if (field.type !== "text" && field.choices?.[0]) {
        defaults[field.id] = field.choices[0].id;
      }
    }
    return defaults;
  });
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const unitPrice = useMemo(
    () => computeUnitPrice(product, selected),
    [product, selected]
  );

  const missingRequired = product.customizationOptions.some(
    (field) => field.required && field.type !== "text" && !selected[field.id]
  );

  function summarize() {
    return product.customizationOptions
      .filter((f) => selected[f.id])
      .map((f) => {
        if (f.type === "text") return `${f.label}: "${selected[f.id]}"`;
        const choice = f.choices?.find((c) => c.id === selected[f.id]);
        return choice ? `${f.label}: ${choice.label}` : null;
      })
      .filter(Boolean)
      .join(", ");
  }

  function handleAddToCart() {
    if (missingRequired) return;
    const lineId = `${product.id}:${JSON.stringify(selected)}`;
    addItem(
      {
        lineId,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.images[0],
        unitPrice,
        customization: selected,
        customizationSummary: summarize(),
      },
      quantity
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div className="space-y-8">
      {product.customizationOptions.map((field) => {
        const isKnownType = KNOWN_FIELD_TYPES.includes(field.type);
        const showsFallback = !isKnownType && !!field.choices?.length;

        if (showsFallback) {
          console.warn(
            `[CustomizationForm] Unrecognised customization field type "${field.type}" on product "${product.slug}" (field "${field.id}") — rendering plain choice buttons as a fallback. Until now this field had no visible picker at all, so a default choice (if any) may have already been silently applied with the customer never seeing or choosing it.`
          );
        }

        return (
        <div key={field.id}>
          <p className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-accent"> *</span>}
          </p>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}

          {field.type === "select" && (
            <div className="mt-2 flex flex-wrap gap-2">
              {field.choices?.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() =>
                    setSelected((s) => ({ ...s, [field.id]: choice.id }))
                  }
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    selected[field.id] === choice.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {choice.label}
                  {choice.priceModifier !== 0 && (
                    <span className="ml-1 text-xs opacity-70">
                      {choice.priceModifier > 0 ? "+" : ""}
                      ${(choice.priceModifier / 100).toFixed(0)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {field.type === "swatch" && (
            <div className="mt-2 flex flex-wrap gap-3">
              {field.choices?.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  title={choice.label}
                  onClick={() =>
                    setSelected((s) => ({ ...s, [field.id]: choice.id }))
                  }
                  className={cn(
                    "size-9 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
                    selected[field.id] === choice.id
                      ? "ring-primary"
                      : "ring-transparent"
                  )}
                  style={{ backgroundColor: choice.hex }}
                />
              ))}
            </div>
          )}

          {field.type === "text" && (
            <Input
              className="mt-2"
              maxLength={field.maxLength}
              value={selected[field.id] ?? ""}
              onChange={(e) =>
                setSelected((s) => ({ ...s, [field.id]: e.target.value }))
              }
            />
          )}

          {field.type === "image-select" && (
            <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {field.choices?.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => {
                    setSelected((s) => ({ ...s, [field.id]: choice.id }));
                    if (choice.imageUrl) onSelectImage?.(choice.imageUrl);
                  }}
                  aria-current={selected[field.id] === choice.id}
                  className={cn(
                    "overflow-hidden rounded-lg ring-2 transition-all",
                    selected[field.id] === choice.id
                      ? "ring-primary"
                      : "ring-transparent hover:ring-border"
                  )}
                >
                  <div className="relative aspect-square w-full bg-muted">
                    {choice.imageUrl && (
                      <Image src={choice.imageUrl} alt="" fill className="object-cover" />
                    )}
                  </div>
                  <p className="mt-1.5 truncate px-1 pb-1 text-center text-xs font-medium">
                    {choice.label}
                    {choice.priceModifier !== 0 && (
                      <span className="ml-1 font-normal opacity-70">
                        {choice.priceModifier > 0 ? "+" : ""}
                        ${(choice.priceModifier / 100).toFixed(0)}
                      </span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          )}

          {showsFallback && (
            <div className="mt-2 flex flex-wrap gap-2">
              {field.choices?.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() =>
                    setSelected((s) => ({ ...s, [field.id]: choice.id }))
                  }
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    selected[field.id] === choice.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {choice.label}
                  {choice.priceModifier !== 0 && (
                    <span className="ml-1 text-xs opacity-70">
                      {choice.priceModifier > 0 ? "+" : ""}
                      ${(choice.priceModifier / 100).toFixed(0)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        );
      })}

      <div className="flex items-center gap-4 border-t border-border pt-6">
        <label className="text-sm font-medium" htmlFor="quantity">
          {t("qty")}
        </label>
        <Input
          id="quantity"
          type="number"
          min={1}
          max={10}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-20"
        />
        <span className="ml-auto font-heading text-2xl">
          ${(unitPrice / 100).toFixed(0)}
        </span>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={missingRequired}
        onClick={handleAddToCart}
      >
        {added ? t("addedToCart") : t("addToCart")}
      </Button>
    </div>
  );
}
