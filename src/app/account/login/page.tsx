import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountLoginForm } from "@/components/account/account-login-form";
import { Container } from "@/components/marketing/container";
import { safeAccountNextPath } from "@/lib/account-auth";
import {
  CustomerAuthenticationError,
  CustomerEmailNotVerifiedError,
  getCurrentAuthenticatedCustomer,
} from "@/lib/customer/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Course payment login" };

export default async function CoursePaymentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; confirmation?: string }>;
}) {
  const query = await searchParams;
  const nextPath = safeAccountNextPath(query.next);
  let activeCustomer = false;
  try {
    const customer = await getCurrentAuthenticatedCustomer();
    activeCustomer = Boolean(customer?.status === "ACTIVE" && !customer.archivedAt && !customer.deactivatedAt);
  } catch (error) {
    if (!(error instanceof CustomerAuthenticationError) && !(error instanceof CustomerEmailNotVerifiedError)) {
      throw error;
    }
  }
  if (activeCustomer) redirect(nextPath);
  const t = await getTranslations("coursePaymentLogin");
  const signupText = await getTranslations("accountSignup");

  return (
    <section className="py-16 sm:py-24">
      <Container className="max-w-md">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p>
        <h1 className="mt-3 font-heading text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("description")}</p>
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <AccountLoginForm nextPath={nextPath} />
          {query.confirmation === "failed" && <p role="alert" className="mt-4 text-sm text-destructive">{signupText("confirmationFailed")}</p>}
          <Link href="/account/signup" className="mt-5 inline-block text-sm underline underline-offset-4">{signupText("title")}</Link>
        </div>
      </Container>
    </section>
  );
}
