import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { expect, it } from "vitest";
import en from "../../../messages/en.json";
import am from "../../../messages/am.json";
import { CoursePlanSelector } from "./course-plan-selector";
import type { PublicCoursePlan } from "@/lib/courses/public-plans";

const privatePlan: PublicCoursePlan = { id: "private", code: "BEGINNER_ONE_TO_ONE", level: "BEGINNER", format: "ONE_TO_ONE", baseAmountCents: 7000, finalAmountCents: 7000, currency: "USD", groupMinimumStudents: null, groupMaximumStudents: null, promotion: null };
const group: PublicCoursePlan = { ...privatePlan, id: "group", code: "BEGINNER_GROUP", format: "GROUP", baseAmountCents: 5000, finalAmountCents: 5000, groupMinimumStudents: 3, groupMaximumStudents: 4 };
function render(plans: PublicCoursePlan[], locale = "en", defaultValue?: string) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : am} timeZone="UTC"><CoursePlanSelector plans={plans} defaultValue={defaultValue} slug="beginner" /></NextIntlClientProvider>);
}
it("renders semantic radios, reduced-motion styling and the selected plan destination", () => {
  const html = render([group, privatePlan], "en", "private");
  expect(html.match(/type="radio"/g)).toHaveLength(2);
  expect(html).toContain('checked="" value="private"');
  expect(html).toContain("plan=private#apply");
  expect(html).toContain("Small Group · 3–4 students");
  expect(html).toContain("motion-reduce:transition-none");
  expect(html).toContain("duration-250");
});
it("renders Advanced as private-only, with no invented group option", () => {
  const html = render([{ ...privatePlan, level: "ADVANCED", code: "ADVANCED_ONE_TO_ONE", baseAmountCents: 10000, finalAmountCents: 10000 }]);
  expect(html.match(/type="radio"/g)).toHaveLength(1);
  expect(html).toContain("$100.00");
  expect(html).not.toContain("Small Group");
});
it("uses actual promotion end time and localizes the offer", () => {
  const html = render([{ ...group, finalAmountCents: 4000, promotion: { endsAt: "2090-01-01T00:00:00.000Z", publicCountdownEnabled: true } }]);
  expect(html).toContain("First payment offer: $40.00");
  expect(html).toContain("2090");
  expect(render([group], "am")).toContain("ትንሽ ቡድን");
});
