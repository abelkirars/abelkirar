"use client";

import { useState } from "react";
import { ProductGallery } from "@/components/store/product-gallery";
import { CustomizationForm } from "@/components/store/customization-form";
import { CustomOrderNotice } from "@/components/store/custom-order-notice";
import type { ProductCustomizationOptions } from "@/types/customization";

interface Props {
  product: {
    id: string;
    slug: string;
    name: string;
    basePrice: number;
    category: string;
    images: string[];
    customizationOptions: ProductCustomizationOptions;
    isCustomMade: boolean;
  };
  galleryClassName?: string;
  children: React.ReactNode;
}

// Renders as a Fragment, not a wrapping <div> — Container's grid-cols-2
// needs exactly two direct DOM children (the gallery, and this right-hand
// column), and a Fragment adds no DOM node of its own, so the existing grid
// CSS keeps working unchanged.
export function ProductDisplay({ product, galleryClassName, children }: Props) {
  const [selectedImage, setSelectedImage] = useState<string | undefined>(product.images[0]);

  return (
    <>
      <ProductGallery
        images={product.images}
        category={product.category}
        name={product.name}
        className={galleryClassName}
        selectedImage={selectedImage}
        onSelectImage={setSelectedImage}
      />

      <div>
        {children}

        <div className="mt-8">
          <CustomizationForm
            product={{
              id: product.id,
              slug: product.slug,
              name: product.name,
              basePrice: product.basePrice,
              images: product.images,
              customizationOptions: product.customizationOptions,
            }}
            onSelectImage={setSelectedImage}
          />
        </div>

        {product.isCustomMade && <CustomOrderNotice productId={product.id} />}
      </div>
    </>
  );
}
