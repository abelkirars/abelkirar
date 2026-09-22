import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EnrollmentCreationView, PreparationSummaryView } from "./prepare-enrollment-form";
import type { PreparationSummary } from "@/lib/courses/prepare-enrollment";
it("renders the required summary with an explicit confirmation boundary", () => {
  const summary: PreparationSummary = { applicationId:"app", learner:{id:"learner",fullName:"Learner",hasLogin:false}, customer:{id:"customer",email:"payer@example.invalid",supabaseUserId:"auth"}, relationship:"GUARDIAN",relationshipState:"DEFERRED_TO_FINAL_TRANSACTION",plan:{id:"plan",code:"BEGINNER_GROUP",level:"BEGINNER",format:"GROUP",monthlyPriceCents:5000,currency:"USD"},cohort:{id:"cohort",code:"Group A",weeklyDay:"SATURDAY",localStartTime:"18:00",timeZone:"America/New_York",durationMinutes:60},periodStart:"2026-10-10",periodEnd:"2026-11-10",paymentDeadlineRule:"7 days after obligation creation",warnings:["NOT ENROLLED YET","NO PAYMENT CREATED YET","NO PORTAL ACCESS YET"] };
  const html=renderToStaticMarkup(createElement(PreparationSummaryView,{summary,onCreate:async()=>{},busy:false}));
  for(const text of ["Learner","payer@example.invalid","GUARDIAN","$50.00 USD","America/New_York","[2026-10-10, 2026-11-10)",...summary.warnings]) expect(html).toContain(text);
  expect(html).toMatch(/<button[^>]*disabled/);
  expect(html).toContain("Create Enrollment &amp; Payment");
  expect(html).toContain("type=\"checkbox\"");
});

it("renders the authoritative creation result and safety warnings", () => {
  const html = renderToStaticMarkup(createElement(EnrollmentCreationView, { result: {
    idempotent: false,
    learner: { id: "learner", fullName: "Learner" },
    customer: { id: "customer", email: "payer@example.invalid", locale: "en" },
    relationship: "GUARDIAN",
    course: { code: "BEGINNER_GROUP", level: "BEGINNER", format: "GROUP" },
    cohort: { id: "cohort", code: "Group A", seatPosition: 1 },
    enrollment: { id: "enrollment", status: "PENDING_PAYMENT", startsAt: "2026-10-10" },
    payment: { id: "payment", status: "PENDING", kind: "INITIAL_ENROLLMENT", periodStart: "2026-10-10", periodEnd: "2026-11-10", createdAt: "2026-09-22T00:00:00.000Z", expiresAt: "2026-09-29T00:00:00.000Z", baseAmountCents: 5000, discountAmountCents: 500, finalAmountCents: 4500, currency: "USD", promotionName: "Launch offer" },
    warnings: ["PAYMENT NOT VERIFIED", "PORTAL ACCESS NOT ACTIVE"],
  } }));
  for (const text of ["Learner", "BEGINNER_GROUP", "Group A", "Seat 1", "$50.00", "$5.00", "$45.00", "PENDING_PAYMENT", "PENDING", "PAYMENT NOT VERIFIED", "PORTAL ACCESS NOT ACTIVE"]) {
    expect(html).toContain(text);
  }
});
