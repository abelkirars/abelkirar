import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProductVisual } from "@/components/store/product-visual";
import { formatUsd } from "@/lib/money";

export function ProductCard({
  href,
  name,
  category,
  description,
  basePrice,
  images,
  isCustomMade = false,
}: {
  href: string;
  name: string;
  category: string;
  description: string;
  basePrice: number;
  images: string[];
  isCustomMade?: boolean;
}) {
  const t = useTranslations("store");
  const tCustom = useTranslations("customOrderNotice");

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
        {isCustomMade && <span className="mb-2 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{tCustom("toggleLabel")}</span>}
        <h2 className="font-heading text-xl font-semibold">{name}</h2>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {description}
        </p>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>{t("production")}</p>
          <p>{t("shipping")}</p>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-medium">
            {t("from", { price: formatUsd(basePrice).replace(/^\$/, "") })}
          </span>
          <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors group-hover:bg-muted">
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
