"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ProductVisual } from "@/components/store/product-visual";
import { cn } from "@/lib/utils";

export function ProductGallery({
  images,
  category,
  name,
  className,
  selectedImage: controlledSelectedImage,
  onSelectImage,
}: {
  images: string[];
  category: string;
  name: string;
  className?: string;
  /**
   * Controlled selected-image pair — omit both to keep ProductGallery fully
   * self-contained (original behavior). Passing onSelectImage switches it
   * to controlled mode even when selectedImage is currently undefined (a
   * product with no gallery photos yet), so it never silently falls back
   * to internal state and diverges from a shared parent's value.
   */
  selectedImage?: string;
  onSelectImage?: (image: string) => void;
}) {
  const t = useTranslations("product");
  const [internalSelectedImage, setInternalSelectedImage] = useState(images[0]);
  const isControlled = onSelectImage !== undefined;
  const selectedImage = isControlled ? controlledSelectedImage : internalSelectedImage;
  const displayImage = selectedImage ?? images[0];

  function handleSelect(image: string) {
    if (isControlled) {
      onSelectImage(image);
    } else {
      setInternalSelectedImage(image);
    }
  }

  return (
    <div className="lg:sticky lg:top-24">
      <ProductVisual
        images={displayImage ? [displayImage] : []}
        category={category}
        name={name}
        className={className}
      />
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => handleSelect(image)}
              aria-label={t("viewPhoto", { index: index + 1, count: images.length })}
              aria-current={image === displayImage}
              className={cn(
                "relative aspect-square w-16 shrink-0 overflow-hidden rounded-lg ring-2 transition-all sm:w-20",
                image === displayImage ? "ring-primary" : "ring-transparent hover:ring-border"
              )}
            >
              <Image src={image} alt="" fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
