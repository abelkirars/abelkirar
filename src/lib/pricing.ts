import type {
  ProductCustomizationOptions,
  SelectedCustomization,
} from "@/types/customization";

interface PriceableProduct {
  basePrice: number;
  customizationOptions: unknown;
}

/**
 * Recomputes an order line's unit price server-side from the product's
 * base price and its customization option price modifiers. Never trust a
 * client-supplied price for checkout.
 */
export function computeUnitPrice(
  product: PriceableProduct,
  selected: SelectedCustomization
): number {
  const fields = (product.customizationOptions ??
    []) as ProductCustomizationOptions;

  let price = product.basePrice;

  for (const field of fields) {
    if (field.type === "text") continue;

    const selectedChoiceId = selected[field.id];
    const choice = field.choices?.find((c) => c.id === selectedChoiceId);
    if (choice) {
      price += choice.priceModifier;
    }
  }

  return price;
}
