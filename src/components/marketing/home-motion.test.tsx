import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import { MaskedWords } from "@/components/motion/masked-words";
import { HomeSectionHeading } from "./home-section-heading";
import { CommunityCta } from "./community-cta";
import { CoursePlanSelector } from "./course-plan-selector";
import type { PublicCoursePlan } from "@/lib/courses/public-plans";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

describe("homepage section motion", () => {
  it("keeps masked headline words as ordinary, complete text", () => {
    const html = renderToStaticMarkup(<h2><MaskedWords text="Learn  the Kirar step by step" /></h2>);
    expect(text(html)).toBe("Learn the Kirar step by step");
    expect(html.match(/--d:/g)).toHaveLength(6);
  });

  it("server-renders the heading copy, starting idle, with a decorative divider", () => {
    const html = renderToStaticMarkup(<HomeSectionHeading eyebrow="Courses" title="Choose your level" description="Real plans." />);
    expect(html).toContain('data-reveal="idle"');
    expect(html).toMatch(/<h2[^>]*>[\s\S]*Choose[\s\S]*your[\s\S]*level[\s\S]*<\/h2>/);
    expect(text(html)).toContain("Real plans.");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders the community call to action as the marketing link, not the shared Button", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><CommunityCta /></NextIntlClientProvider>,
    );
    expect(html).toMatch(/<a[^>]*href="\/contact"[^>]*>[\s\S]*Contact Deacon Abel/);
    expect(html).not.toContain('data-slot="button"');
  });
});

describe("plan selector styling hooks", () => {
  const plan: PublicCoursePlan = { id: "p1", code: "BEGINNER_ONE_TO_ONE", level: "BEGINNER", format: "ONE_TO_ONE", baseAmountCents: 7000, finalAmountCents: 7000, currency: "USD", groupMinimumStudents: null, groupMaximumStudents: null, promotion: null };
  const group: PublicCoursePlan = { ...plan, id: "p2", code: "BEGINNER_GROUP", format: "GROUP", baseAmountCents: 5000, finalAmountCents: 4000, groupMinimumStudents: 3, groupMaximumStudents: 4, promotion: { endsAt: "2090-01-01T00:00:00.000Z", publicCountdownEnabled: true } };

  it("keeps radio values, the selected plan, real prices and the destination unchanged", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-plan-motion=""><CoursePlanSelector plans={[group, plan]} defaultValue="p2" slug="beginner" /></div>
      </NextIntlClientProvider>,
    );
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('value="p1"');
    expect(html).toContain('checked="" value="p2"');
    expect(html).toContain("$50.00");
    expect(html).toContain("$70.00");
    expect(html).toContain("First payment offer: $40.00");
    expect(html).toContain("plan=p2#apply");
  });
});
