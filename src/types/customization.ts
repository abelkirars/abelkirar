export type CustomizationFieldType = "select" | "swatch" | "text" | "image-select";

export interface CustomizationChoice {
  id: string;
  label: string;
  /** Additional cost in cents, added to the product's basePrice. */
  priceModifier: number;
  /** Hex color, only used when the parent field type is "swatch". */
  hex?: string;
  /** Public image URL, only used when the parent field type is "image-select". */
  imageUrl?: string;
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

/**
 * Resolved snapshot of a single field's pick, written once at order-creation
 * time onto OrderItem.selectedCustomizationSnapshot — mirrors that column's
 * doc comment exactly. `imageUrl` present only when the field's type was
 * "image-select" at the time of purchase.
 */
export interface SelectedCustomizationSnapshotEntry {
  fieldLabel: string;
  choiceLabel: string;
  priceModifier: number;
  imageUrl?: string;
}

/** Keyed by fieldId — same keys as SelectedCustomization. */
export type SelectedCustomizationSnapshot = Record<string, SelectedCustomizationSnapshotEntry>;
