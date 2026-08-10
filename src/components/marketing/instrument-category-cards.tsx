import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { INSTRUMENT_CATEGORIES } from "@/lib/instrument-categories";
import { categoryGradient } from "@/lib/category-gradients";
import { CrossPattern } from "@/components/marketing/cross-pattern";

export function InstrumentCategoryCards({
  imagesByCategory,
}: {
  imagesByCategory: Record<string, string[]>;
}) {
  const t = useTranslations("instrumentCategories");

  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {INSTRUMENT_CATEGORIES.map((category) => {
        const image = imagesByCategory[category.id]?.[0];

        return (
          <Link
            key={category.id}
            href={`/store?category=${category.id}`}
            className="group relative flex aspect-3/4 flex-col justify-end overflow-hidden rounded-2xl p-6 text-[#f3e9d2]"
          >
            {image ? (
              <>
                <Image src={image} alt={category.name} fill className="object-cover" />
                {/* Scrim: the gradient path is dark enough on its own for the
                    cream text to stay legible; a photo isn't guaranteed to
                    be, so this darkens the bottom where the text sits
                    regardless of the photo's own colors. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </>
            ) : (
              <div
                className={`absolute inset-0 bg-gradient-to-br ${categoryGradient(category.id)}`}
              />
            )}
            <CrossPattern className="text-[#f3e9d2] opacity-[0.14]" />
            <div className="relative">
              <h3 className="font-heading text-2xl font-semibold">{category.name}</h3>
              <p className="mt-2 text-sm text-[#f3e9d2]/80">{category.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">
                {t("shopCategory", { category: category.name })}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
