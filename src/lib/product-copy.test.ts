import { expect, it } from "vitest";
import { correctProductCopy } from "./product-copy";
it("repairs the known cultural errors and preserves custom copy", () => {
  expect(correctProductCopy({ category: "MEKWAMIYA", name: "Mekwamiya", description: "Mekwamiya - spiritual Ethiopian wind instrument." }).description).toContain("chanting staff");
  expect(correctProductCopy({ category: "KABA", name: "Kaba", description: "Kaba - traditional Ethiopian drum instrument." }).description).toContain("ceremonial clothing");
  const custom = { category: "KABA", name: "Embroidered Kaba", description: "Gold embroidery, made to measure." };
  expect(correctProductCopy(custom)).toEqual(custom);
});
