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
}: {
  images: string[];
  category: string;
  name: string;
  className?: string;
}) {
  const t = useTranslations("product");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedImage = images[selectedIndex] ?? images[0];

  return (
    <div className="lg:sticky lg:top-24">
      <ProductVisual
        images={selectedImage ? [selectedImage] : []}
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
              onClick={() => setSelectedIndex(index)}
              aria-label={t("viewPhoto", { index: index + 1, count: images.length })}
              aria-current={index === selectedIndex}
              className={cn(
                "relative aspect-square w-16 shrink-0 overflow-hidden rounded-lg ring-2 transition-all sm:w-20",
                index === selectedIndex ? "ring-primary" : "ring-transparent hover:ring-border"
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
