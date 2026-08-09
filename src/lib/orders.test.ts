import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindManyProduct = vi.fn();
const mockFindUniqueProduct = vi.fn();
const mockCreateOrder = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findMany: (...args: unknown[]) => mockFindManyProduct(...args),
      findUnique: (...args: unknown[]) => mockFindUniqueProduct(...args),
    },
    order: {
      create: (...args: unknown[]) => mockCreateOrder(...args),
    },
  },
}));

import { createManualOrder, createCustomOrder, OrderCreationError } from "@/lib/orders";
import type { CreateOrderInput } from "@/lib/validations/order";
import type { CreateCustomOrderInput } from "@/lib/validations/custom-order";

const kirar = {
  id: "product-1",
  name: "Kirar Standard",
  images: ["https://example.com/kirar.jpg"],
  variantName: null,
  basePrice: 5000, // $50.00
  customizationOptions: [
    {
      id: "wood",
      label: "Wood",
      type: "select",
      required: true,
      choices: [
        { id: "rosewood", label: "Rosewood", priceModifier: 1500 },
        { id: "mahogany", label: "Mahogany", priceModifier: 0 },
      ],
    },
  ],
  isActive: true,
  isCustomMade: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateOrder.mockResolvedValue({ id: "order-1", items: [] });
});

describe("createManualOrder", () => {
  function buildInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
    return {
      items: [{ productId: "product-1", customization: { wood: "rosewood" }, quantity: 2 }],
      paymentRegion: "US",
      paymentMethod: "ZELLE",
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      customerPhone: "+15555550100",
      ...overrides,
    };
  }

  it("computes the total from the DB product's basePrice and matched priceModifier, ignoring any extraneous client-supplied key", async () => {
    mockFindManyProduct.mockResolvedValue([kirar]);

    const input = buildInput({
      items: [
        {
          productId: "product-1",
          // "price" is not a real customization field on this product — the
          // zod schema (an open Record<string,string>) would let a client
          // send it, but computeUnitPrice only ever reads field ids that
          // exist in the DB product's own customizationOptions.
          customization: { wood: "rosewood", price: "999999" },
          quantity: 2,
        },
      ],
    });

    await createManualOrder(input, "en");

    // basePrice 5000 + rosewood modifier 1500 = 6500/unit * qty 2 = 13000
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtotal: 13000, total: 13000 }),
      })
    );
  });

  it("produces a different total for the same request when the DB product's basePrice differs", async () => {
    mockFindManyProduct.mockResolvedValue([{ ...kirar, basePrice: 8000 }]);

    await createManualOrder(buildInput(), "en");

    // 8000 + 1500 = 9500/unit * qty 2 = 19000 — proves the price tracks the
    // DB record, not anything cached or inferred from the request itself.
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtotal: 19000, total: 19000 }),
      })
    );
  });

  it("derives currency 'usd' for a US order and 'eur' for a EUROZONE order", async () => {
    mockFindManyProduct.mockResolvedValue([kirar]);

    await createManualOrder(buildInput({ paymentRegion: "US", paymentMethod: "ZELLE" }), "en");
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: "usd" }) })
    );

    mockCreateOrder.mockClear();
    await createManualOrder(
      buildInput({ paymentRegion: "EUROZONE", paymentMethod: "EUR_BANK_TRANSFER" }),
      "en"
    );
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: "eur" }) })
    );
  });

  it("has no independent bound on quantity — the schema's max(10) is the only enforcement, not this function", async () => {
    mockFindManyProduct.mockResolvedValue([kirar]);

    const input = buildInput({
      items: [{ productId: "product-1", customization: {}, quantity: 999 }],
    });

    await createManualOrder(input, "en");

    // No customization selected → unitPrice is basePrice alone (5000).
    // createManualOrder multiplies by whatever quantity it receives — the
    // schema's z.number().int().min(1).max(10) (src/lib/validations/order.ts)
    // is the only place this is actually bounded, and it runs before this
    // function is ever called (see src/app/api/orders/route.ts). This test
    // documents that trust boundary, not a defense inside this function.
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtotal: 4995000, total: 4995000 }),
      })
    );
  });
});

describe("createCustomOrder", () => {
  function buildInput(overrides: Partial<CreateCustomOrderInput> = {}): CreateCustomOrderInput {
    return {
      productId: "product-1",
      description: "A custom kirar with a hand-carved rosette, please.",
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      customerPhone: "+15555550100",
      paymentRegion: "US",
      ...overrides,
    };
  }

  it("writes subtotal 0, total 0, paymentStatus PENDING_QUOTE, orderType CUSTOM_QUOTE", async () => {
    mockFindUniqueProduct.mockResolvedValue({ ...kirar, isCustomMade: true });

    await createCustomOrder(buildInput(), "en");

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderType: "CUSTOM_QUOTE",
          paymentStatus: "PENDING_QUOTE",
          subtotal: 0,
          total: 0,
        }),
      })
    );
  });

  it("throws when the product does not exist", async () => {
    mockFindUniqueProduct.mockResolvedValue(null);

    await expect(createCustomOrder(buildInput(), "en")).rejects.toBeInstanceOf(OrderCreationError);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("throws when the product is inactive", async () => {
    mockFindUniqueProduct.mockResolvedValue({ ...kirar, isCustomMade: true, isActive: false });

    await expect(createCustomOrder(buildInput(), "en")).rejects.toBeInstanceOf(OrderCreationError);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("throws when the product is not flagged as Custom Made", async () => {
    mockFindUniqueProduct.mockResolvedValue({ ...kirar, isCustomMade: false, isActive: true });

    await expect(createCustomOrder(buildInput(), "en")).rejects.toBeInstanceOf(OrderCreationError);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});
