import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudentProfile } from "@prisma/client";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { StudentForm } from "./student-form";

it("renders a null-login learner without a fake email or account claim", () => {
  const student = { id: "learner", fullName: "Learner", supabaseUserId: null, email: null, status: "ACTIVE", locale: "en", level: null, enrollmentDate: null } as StudentProfile;
  const html = renderToStaticMarkup(createElement(StudentForm, { student }));
  expect(html).toContain("No learner login. Guardian/customer account email is separate.");
  expect(html).toContain("Learner login/contact email");
  expect(html).not.toContain("value=\"null\"");
});

it("preserves the existing learner-owned email display", () => {
  const student = { id: "learner", fullName: "Learner", supabaseUserId: "auth", email: "learner@example.invalid", status: "ACTIVE", locale: "en", level: null, enrollmentDate: null } as StudentProfile;
  const html = renderToStaticMarkup(createElement(StudentForm, { student }));
  expect(html).toContain("learner@example.invalid");
  expect(html).not.toContain("No learner login.");
});
