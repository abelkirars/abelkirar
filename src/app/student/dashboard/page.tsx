import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { requireStudentPage } from "@/lib/student/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Student Dashboard",
};

// Placeholder only — the real dashboard is Phase 5. This page exists so
// login/set-password have somewhere valid to redirect to, and so
// requireStudentPage() has a real protected route to enforce against.
export default async function StudentDashboardPage() {
  const session = await requireStudentPage();
  const t = await getTranslations("studentDashboard");

  return (
    <section className="py-16 sm:py-24">
      <Container>
        <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("greeting", { fullName: session.fullName })}
        </p>
        <p className="mt-6 rounded-md border border-border p-4 text-sm text-muted-foreground">
          {t("placeholderNotice")}
        </p>
      </Container>
    </section>
  );
}
