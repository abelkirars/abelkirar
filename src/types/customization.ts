export type CustomizationFieldType = "select" | "swatch" | "text";

export interface CustomizationChoice {
  id: string;
  label: string;
  /** Additional cost in cents, added to the product's basePrice. */
  priceModifier: number;
  /** Hex color, only used when the parent field type is "swatch". */
  hex?: string;
}

export interface CustomizationField {
  id: string;
  label: string;
  type: CustomizationFieldType;
  required: boolean;
  helpText?: string;
  choices?: CustomizationChoice[];
  /** Max length, only used when type is "text" (e.g. custom engraving). */
  maxLength?: number;
}

export type ProductCustomizationOptions = CustomizationField[];

/** What a buyer actually picked, snapshotted onto an OrderItem at purchase time. */
export type SelectedCustomization = Record<string, string>;
