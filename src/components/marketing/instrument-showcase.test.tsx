import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstrumentShowcase, type ShowcaseInstrument } from "./instrument-showcase";

const HOST = "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images";
const instruments: ShowcaseInstrument[] = [
  { id: "KIRAR", name: "Kirar", description: "A traditional Ethiopian lyre.", href: "/store?category=KIRAR", shopLabel: "Shop Kirar", image: `${HOST}/kirar.png`, imageAlt: "A handmade Kirar from the Abelkirar store" },
  { id: "BEGENA", name: "Begena", description: "The ten-string lyre.", href: "/store?category=BEGENA", shopLabel: "Shop Begena", image: `${HOST}/begena.png`, imageAlt: "A handmade Begena from the Abelkirar store" },
  { id: "MESENKO", name: "Masenqo", description: "A single-string bowed instrument.", href: "/store?category=MESENKO", shopLabel: "Shop Masenqo", imageAlt: "A handmade Masenqo from the Abelkirar store" },
];
const html = renderToStaticMarkup(<InstrumentShowcase instruments={instruments} tabsLabel="Instruments" />);

describe("InstrumentShowcase server render", () => {
  it("renders every instrument's name, description and exact Store link", () => {
    for (const instrument of instruments) {
      expect(html).toContain(instrument.description);
      expect(html).toContain(`href="${instrument.href.replace("&", "&amp;")}"`);
      expect(html).toContain(instrument.shopLabel);
      expect(html).toMatch(new RegExp(`<h3[^>]*>${instrument.name}</h3>`));
    }
    expect(html.match(/href="\/store\?category=/g)).toHaveLength(3);
  });

  it("marks the first instrument selected and adds tab roles only after hydration", () => {
    expect(html.match(/data-selected=""/g)).toHaveLength(2); // Kirar's tab + panel
    expect(html).not.toContain('role="tab');
    expect(html).toContain('data-reveal="idle"');
  });

  it("requests only the selected photo; the others are noscript-only; no staging image", () => {
    const eager = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    expect(eager.match(/<img /g)).toHaveLength(1);
    expect(eager).toContain(encodeURIComponent(`${HOST}/kirar.png`));
    expect(eager).toContain('alt="A handmade Kirar from the Abelkirar store"');
    expect(html.match(/<noscript>/g)).toHaveLength(1); // Begena only; Masenqo has no photo
    expect(html).not.toContain("products-to-upload");
  });

  it("draws a line portrait for every instrument (the Masenqo fallback)", () => {
    expect(html.match(/viewBox="0 0 300 460"/g)).toHaveLength(3);
  });
});
