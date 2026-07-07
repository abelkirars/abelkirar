import Image from "next/image";
import { categoryGradient } from "@/lib/category-gradients";
import { CrossPattern } from "@/components/marketing/cross-pattern";

export function ProductVisual({
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
  const image = images[0];

  if (image) {
    return (
      <div className={`relative overflow-hidden rounded-2xl ${className ?? ""}`}>
        <Image src={image} alt={name} fill className="object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br text-[#f3e9d2] ${categoryGradient(category)} ${className ?? ""}`}
    >
      <CrossPattern className="text-[#f3e9d2] opacity-[0.14]" />
      <div className="relative flex h-full items-end p-6">
        <span className="font-heading text-xl font-semibold">{name}</span>
      </div>
    </div>
  );
}
