"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/marketing/container";
import { useCartStore } from "@/store/cart-store";

export default function CheckoutSuccessPage() {
  const clear = useCartStore((s) => s.clear);

  useEffect(() => {
    clear();
  }, [clear]);

  return (
    <section className="py-24">
      <Container className="max-w-xl text-center">
        <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
          Thank you for your order
        </h1>
        <p className="mt-4 text-lg text-muted-foreground text-pretty">
          We&rsquo;ve received your order and sent a confirmation to your
          email. Your instrument is handmade to order — we&rsquo;ll be in
          touch with next steps and a timeline shortly.
        </p>
        <Button className="mt-8" nativeButton={false} render={<Link href="/store" />}>
          Continue browsing
        </Button>
      </Container>
    </section>
  );
}
