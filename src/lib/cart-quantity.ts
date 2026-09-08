export const MAX_CART_QUANTITY = 10;

export function normalizeCartQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_CART_QUANTITY, Math.max(1, Math.floor(value)));
}
