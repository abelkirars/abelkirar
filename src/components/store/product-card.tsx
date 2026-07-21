import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductVisual } from "@/components/store/product-visual";

export function ProductCard({
  href,
  name,
  category,
  description,
  basePrice,
  images,
}: {
  href: string;
  name: string;
  category: string;
  description: string;
  basePrice: number;
  images: string[];
}) {
  return (
    <Link href={href} className="group">
      <ProductVisual
        images={images}
        category={category}
        name={name}
        className="aspect-4/5"
      />
      <div className="mt-4">
        <h3 className="font-heading text-xl font-semibold">{name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {description}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-medium">
            From ${(basePrice / 100).toFixed(0)}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
            View
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}
