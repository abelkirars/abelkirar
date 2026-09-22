import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PreparationSummaryView } from "./prepare-enrollment-form";
import type { PreparationSummary } from "@/lib/courses/prepare-enrollment";
it("renders the required summary with no active final-creation action", () => {
  const summary: PreparationSummary = { applicationId:"app", learner:{id:"learner",fullName:"Learner",hasLogin:false}, customer:{id:"customer",email:"payer@example.invalid",supabaseUserId:"auth"}, relationship:"GUARDIAN",relationshipState:"DEFERRED_TO_FINAL_TRANSACTION",plan:{id:"plan",code:"BEGINNER_GROUP",level:"BEGINNER",format:"GROUP",monthlyPriceCents:5000,currency:"USD"},cohort:{id:"cohort",code:"Group A",weeklyDay:"SATURDAY",localStartTime:"18:00",timeZone:"America/New_York",durationMinutes:60},periodStart:"2026-10-10",periodEnd:"2026-11-10",paymentDeadlineRule:"7 days after obligation creation",warnings:["NOT ENROLLED YET","NO PAYMENT CREATED YET","NO PORTAL ACCESS YET"] };
  const html=renderToStaticMarkup(createElement(PreparationSummaryView,{summary}));
  for(const text of ["Learner","payer@example.invalid","GUARDIAN","$50.00 USD","America/New_York","[2026-10-10, 2026-11-10)",...summary.warnings]) expect(html).toContain(text);
  expect(html).toMatch(/<button[^>]*disabled/);
  expect(html).toContain("Create Enrollment &amp; Payment");
});
