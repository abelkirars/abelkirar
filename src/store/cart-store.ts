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
  /** Whether this line is included in the next checkout. Defaults to true. */
  selected: boolean;
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity" | "selected">, quantity?: number) => void;
  removeItem: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  toggleSelected: (lineId: string) => void;
  setAllSelected: (selected: boolean) => void;
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
          return { items: [...state.items, { ...item, quantity, selected: true }] };
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
      toggleSelected: (lineId) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.lineId === lineId ? { ...i, selected: !i.selected } : i
          ),
        })),
      setAllSelected: (selected) =>
        set((state) => ({
          items: state.items.map((i) => ({ ...i, selected })),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "abelkirar-cart",
      version: 1,
      // v0 carts (persisted before `selected` existed) must backfill it as
      // true — otherwise those items would silently rehydrate as unselected.
      migrate: (persistedState, version) => {
        const state = persistedState as CartState;
        if (version < 1) {
          state.items = state.items.map((i) => ({ ...i, selected: i.selected ?? true }));
        }
        return state;
      },
    }
  )
);

export function cartTotalItems(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function cartTotalPrice(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}
