export type CopyLocale = "en" | "am";
export interface CopyFieldValue { value: string; original: string }
export interface CopyField {
  key: string;
  label: string;
  placeholders: string[];
  en: CopyFieldValue;
  am: CopyFieldValue;
  editedAt: string | null;
  editedBy: string | null;
}
export interface CopySection { id: string; label: string; fields: CopyField[] }
export interface CopyPage { id: string; label: string; category: string; sections: string[] }

const PAGES: CopyPage[] = [
  { id: "home", label: "Home", category: "Pages on the site", sections: ["hero", "mission", "home", "courseLevels"] },
  { id: "about", label: "About — your story", category: "Pages on the site", sections: ["about"] },
  { id: "courses", label: "Courses", category: "Pages on the site", sections: ["courses"] },
  { id: "courseDetails", label: "Course pages", category: "Pages on the site", sections: ["courseDetails", "coursePricing"] },
  { id: "store", label: "Store", category: "Pages on the site", sections: ["store", "product", "instrumentCategories", "customOrderNotice"] },
  { id: "community", label: "Community", category: "Pages on the site", sections: ["community"] },
  { id: "contact", label: "Contact", category: "Pages on the site", sections: ["contact"] },
  { id: "shared", label: "Header & footer", category: "Everywhere", sections: ["header", "nav", "footer"] },
  { id: "forms", label: "Forms & buttons", category: "Not on a page", sections: ["contactForm", "courseApplicationForm", "newsletterForm", "passwordToggle"] },
  { id: "payment", label: "Cart, orders & payment", category: "Not on a page", sections: ["cart", "orderConfirmation", "paymentLabels", "paymentInstructions", "paymentConfirmationForm"] },
  { id: "emails", label: "Emails", category: "Not on a page", sections: ["emails", "courseApplicationEmails"] },
  { id: "student", label: "Student area", category: "Not on a page", sections: ["studentLogin", "studentSetPassword", "studentForgotPassword", "studentDashboard"] },
  { id: "errors", label: "Error messages", category: "Not on a page", sections: ["validation", "pageError"] },
];

/** Unknown future namespaces remain editable without updating this navigation. */
export function copyPages(sections: CopySection[]): CopyPage[] {
  const available = new Set(sections.map((section) => section.id));
  const pages = PAGES.map((page) => ({ ...page, sections: page.sections.filter((id) => available.has(id)) }))
    .filter((page) => page.sections.length > 0);
  const mapped = new Set(pages.flatMap((page) => page.sections));
  return [...pages, ...sections.filter((section) => !mapped.has(section.id)).map((section) => ({
    id: section.id, label: section.label, category: "Other text", sections: [section.id],
  }))];
}

export function copyFieldId(locale: CopyLocale, key: string) { return `${locale}:${key}`; }
export interface CopyChange { locale: CopyLocale; key: string; value: string }

/** Confirm each completed batch immediately, including when a later request fails. */
export async function saveCopyChanges(
  changes: CopyChange[],
  onConfirmed: (batch: CopyChange[]) => void,
  request: typeof fetch = fetch,
) {
  for (let index = 0; index < changes.length; index += 100) {
    const batch = changes.slice(index, index + 100);
    const response = await request("/api/admin/content", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes: batch }),
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error ?? "The server did not confirm this save. Please try again.");
    onConfirmed(batch);
  }
}
