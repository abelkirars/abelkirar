"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductForm } from "@/components/admin/product-form";
import { categoryLabel } from "@/lib/category-gradients";

export function ProductRow({ product }: { product: Product }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function togglePublish() {
    setBusy("toggle");
    setError(null);
    const formData = new FormData();
    formData.set("published", String(!product.isActive));
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-border p-4">
        <ProductForm product={product} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-medium">
            {product.name}
            {product.variantName && (
              <span className="text-muted-foreground"> — {product.variantName}</span>
            )}
          </h3>
          <Badge variant="outline">{categoryLabel(product.category)}</Badge>
          <Badge variant={product.isActive ? "default" : "outline"}>
            {product.isActive ? "Published" : "Draft"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          ${(product.basePrice / 100).toFixed(2)}
        </p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={togglePublish}>
          {product.isActive ? "Unpublish" : "Publish"}
        </Button>
        <Button size="sm" variant="destructive" disabled={busy !== null} onClick={remove}>
          Delete
        </Button>
      </div>
    </div>
  );
}
