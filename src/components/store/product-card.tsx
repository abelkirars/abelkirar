import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("store");

  return (
    <Link
      href={href}
      className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <ProductVisual
        images={images}
        category={category}
        name={name}
        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
        className="aspect-4/5 transition-shadow duration-300 group-hover:shadow-lg group-focus-visible:shadow-lg"
      />
      <div className="mt-4">
        <h2 className="font-heading text-xl font-semibold">{name}</h2>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {description}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-medium">
            {t("from", { price: (basePrice / 100).toFixed(0) })}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors group-hover:text-accent/80">
            {t("view")}
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
            />
          </span>
        </div>
      </div>
    </Link>
  );
}
