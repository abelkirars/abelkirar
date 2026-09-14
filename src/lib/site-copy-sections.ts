/**
 * Human names for the top-level namespaces in messages/{locale}.json.
 *
 * The editor is used by one person who writes the copy and does not read the
 * code, so "hero" and "mission" — accurate names for a developer reading JSX —
 * are useless as navigation. These say where on the site the words appear.
 *
 * A namespace with no entry here is shown with its raw name rather than
 * hidden: a new section must still be editable the day it is added, before
 * anyone remembers to name it.
 */
export const SECTION_LABELS: Record<string, string> = {
  nav: "Menu links",
  header: "Header",
  footer: "Footer",
  hero: "Home — top banner",
  mission: "Home — why Abelkirar",
  home: "Home — sections",
  courseLevels: "Course cards",
  courseDetails: "Course pages",
  courses: "Courses page",
  courseApplicationForm: "Course application form",
  courseApplicationEmails: "Course application emails",
  about: "About — your story",
  community: "Community page",
  contact: "Contact page",
  contactForm: "Contact form",
  newsletterForm: "Newsletter form",
  store: "Store page",
  product: "Product page",
  instrumentCategories: "Instrument categories",
  customOrderNotice: "Custom order notice",
  cart: "Cart",
  orderConfirmation: "Order confirmation",
  paymentLabels: "Payment labels",
  paymentInstructions: "Payment instructions",
  paymentConfirmationForm: "Payment confirmation form",
  studentLogin: "Student login",
  studentSetPassword: "Student — set password",
  studentForgotPassword: "Student — forgot password",
  studentDashboard: "Student dashboard",
  emails: "Emails",
  validation: "Form error messages",
  passwordToggle: "Show / hide password",
  pageError: "Error page",
};

export function sectionLabel(namespace: string): string {
  return SECTION_LABELS[namespace] ?? humanize(namespace);
}

/** "whyDescription" -> "Why description", "orderPending.subject" -> "Order pending · subject" */
export function fieldLabel(path: string): string {
  return path.split(".").map(humanize).join(" · ");
}

function humanize(segment: string): string {
  const spaced = segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
