"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NAV_LINKS } from "@/lib/nav";
import { useCartStore, cartTotalItems } from "@/store/cart-store";

export function SiteHeader() {
  const items = useCartStore((state) => state.items);
  const itemCount = cartTotalItems(items);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="font-heading text-xl font-semibold tracking-tight">
          Abelkirar
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            nativeButton={false}
            render={<Link href="/store/cart" aria-label="View cart" />}
          >
            <ShoppingBag className="size-5" />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
                {itemCount}
              </span>
            )}
          </Button>
          <Button
            className="hidden md:inline-flex"
            nativeButton={false}
            render={<Link href="/courses" />}
          >
            Start Learning
          </Button>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
