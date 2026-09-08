// Correct known seed mistakes while the data migration is pending. Custom
// descriptions written by the owner are preserved.
export function correctProductCopy<T extends { category: string; name: string; description: string }>(product: T): T {
  const corrections: Record<string, [string, string]> = {
    MEKWAMIYA: ["Mekwamiya - spiritual Ethiopian wind instrument.", "Mekwamiya — a liturgical prayer and chanting staff used in Ethiopian Orthodox worship."],
    KABA: ["Kaba - traditional Ethiopian drum instrument.", "Kaba — traditional Ethiopian ceremonial clothing worn for special and religious occasions."],
    TSENATSL: ["Tsenatsl - traditional Ethiopian percussion instrument.", "Tsenatsl — a shaken metal sistrum (idiophone) used in Ethiopian Orthodox church worship."],
  };
  const correction = corrections[product.category];
  return { ...product,
    name: product.category === "PICK_UPS" && product.name === "Pick Ups" ? "Pickups" : product.name,
    description: correction && product.description === correction[0] ? correction[1] : product.description,
  };
}
