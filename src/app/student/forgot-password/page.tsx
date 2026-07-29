import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { StudentForgotPasswordForm } from "@/components/student/student-forgot-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forgot Password",
};

export default async function StudentForgotPasswordPage() {
  const t = await getTranslations("studentForgotPassword");

  return (
    <section className="py-16 sm:py-24">
      <Container className="max-w-md">
        <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>

        <div className="mt-8">
          <StudentForgotPasswordForm />
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/student/login" className="text-accent hover:underline">
            {t("backToLogin")}
          </Link>
        </p>
      </Container>
    </section>
  );
}
