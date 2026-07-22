"use client";

import { useEffect } from "react";
import { useCartStore } from "@/store/cart-store";

export function ClearCartOnMount() {
  const clear = useCartStore((s) => s.clear);

  useEffect(() => {
    clear();
    // Only ever run once per page load — clearing on every render would wipe
    // a cart the customer started rebuilding while still on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
