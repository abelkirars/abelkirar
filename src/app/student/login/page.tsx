import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { StudentLoginForm } from "@/components/student/student-login-form";
import { resolveStudentSession } from "@/lib/student/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Student Login",
};

export default async function StudentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await resolveStudentSession();
  if (session.kind === "active") {
    redirect("/student/dashboard");
  }

  const { error } = await searchParams;
  const t = await getTranslations("studentLogin");

  const errorMessage =
    error === "account-not-found"
      ? t("errorAccountNotFound")
      : error === "account-inactive"
        ? t("errorAccountInactive")
        : null;

  return (
    <section className="py-16 sm:py-24">
      <Container className="max-w-md">
        <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>

        {errorMessage && (
          <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <div className="mt-8">
          <StudentLoginForm />
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/student/forgot-password" className="text-accent hover:underline">
            {t("forgotPasswordLink")}
          </Link>
        </p>
      </Container>
    </section>
  );
}
