import { createElement, type ComponentProps, type ComponentType, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { expect, it } from "vitest";
import en from "../../../messages/en.json";
import am from "../../../messages/am.json";
import { CoursePriceAmount } from "./course-price-amount";

// createElement supplies children as its third argument. Allow that calling
// convention while retaining the real provider and all its other prop types.
const Provider = NextIntlClientProvider as ComponentType<PropsWithChildren<Omit<ComponentProps<typeof NextIntlClientProvider>, "children">>>;

it.each([["en", en], ["am", am]] as const)("renders discounted cents and badge in %s", (locale, messages) => {
  const html = renderToStaticMarkup(createElement(Provider, { locale, messages, timeZone: "Africa/Addis_Ababa" }, createElement(CoursePriceAmount, {
    pricing: { basePriceCents: 8500, finalPriceCents: 4250, discountAmountCents: 4250, percentOff: 50, isDiscounted: true },
  })));
  expect(html).toContain("<del");
  expect(html).toContain("$85");
  expect(html).toContain("$42.50");
  expect(html).toContain(locale === "en" ? "50% off" : "50% ቅናሽ");
});

it("renders the base price alone when inactive", () => {
  const html = renderToStaticMarkup(createElement(Provider, { locale: "en", messages: en, timeZone: "Africa/Addis_Ababa" }, createElement(CoursePriceAmount, {
    pricing: { basePriceCents: 7000, finalPriceCents: 7000, discountAmountCents: 0, percentOff: 0, isDiscounted: false },
  })));
  expect(html).toContain("$70");
  expect(html).not.toContain("<del");
  expect(html).not.toContain("% off");
});
