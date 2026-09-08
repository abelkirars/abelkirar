import { beforeEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  });
  vi.stubGlobal("window", { localStorage: globalThis.localStorage });
});
import { useCartStore, cartTotalPrice } from "./cart-store";
import { checkoutItemSchema } from "@/lib/validations/order";

const item = { lineId: "kirar:default", productId: "kirar", slug: "kirar", name: "Kirar", unitPrice: 12345, customization: {}, customizationSummary: "" };
beforeEach(() => useCartStore.setState({ items: [] }));

describe("cart quantities", () => {
  it("keeps repeated additions within the checkout limit", () => {
    useCartStore.getState().addItem(item, 7);
    useCartStore.getState().addItem(item, 7);
    const [line] = useCartStore.getState().items;
    expect(line.quantity).toBe(10);
    expect(checkoutItemSchema.safeParse(line).success).toBe(true);
    expect(cartTotalPrice([line])).toBe(123450);
  });
  it("normalizes fractional, excessive and non-finite quantities", () => {
    useCartStore.getState().addItem(item, 2.8);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
    for (const value of [100, 1.5, NaN, Infinity]) {
      useCartStore.getState().setQuantity(item.lineId, value);
      expect(checkoutItemSchema.safeParse(useCartStore.getState().items[0]).success).toBe(true);
    }
  });
  it("preserves selection and other lines when quantities change", () => {
    useCartStore.getState().addItem(item);
    useCartStore.getState().addItem({ ...item, lineId: "other" }, 3);
    useCartStore.getState().toggleSelected(item.lineId);
    useCartStore.getState().setQuantity(item.lineId, 4);
    expect(useCartStore.getState().items.map(({ quantity, selected }) => ({ quantity, selected }))).toEqual([{ quantity: 4, selected: false }, { quantity: 3, selected: true }]);
    useCartStore.getState().setQuantity(item.lineId, 0);
    expect(useCartStore.getState().items.map((i) => i.lineId)).toEqual(["other"]);
  });
  it("repairs old persisted quantities without losing unchecked items", async () => {
    const migrate = useCartStore.persist.getOptions().migrate!;
    const state = await migrate({ items: [{ ...item, quantity: 25, selected: false }] }, 1) as { items: { quantity: number; selected: boolean }[] };
    expect(state.items[0]).toMatchObject({ quantity: 10, selected: false });
  });
});
