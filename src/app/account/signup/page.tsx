import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { AccountSignupForm } from "@/components/account/account-signup-form";

export default async function AccountSignupPage() {
  const t = await getTranslations("accountSignup");
  return <Container className="max-w-md space-y-6 py-16"><h1 className="font-heading text-3xl">{t("title")}</h1><p>{t("description")}</p><AccountSignupForm /><Link href="/account/login" className="inline-block underline underline-offset-4">{t("signIn")}</Link></Container>;
}
