import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SelectedCustomization } from "@/types/customization";

export interface CartItem {
  /** Stable key for this exact product + customization combination. */
  lineId: string;
  productId: string;
  slug: string;
  name: string;
  image?: string;
  unitPrice: number;
  customization: SelectedCustomization;
  customizationSummary: string;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.lineId === item.lineId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.lineId === item.lineId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity }] };
        }),
      removeItem: (lineId) =>
        set((state) => ({
          items: state.items.filter((i) => i.lineId !== lineId),
        })),
      setQuantity: (lineId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.lineId !== lineId)
              : state.items.map((i) =>
                  i.lineId === lineId ? { ...i, quantity } : i
                ),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: "abelkirar-cart" }
  )
);

export function cartTotalItems(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function cartTotalPrice(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}
