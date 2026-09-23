import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AccountSignOut } from "./account-sign-out";

export async function AccountNavigation({ showManagedLearners = false }: { showManagedLearners?: boolean } = {}) {
  const t = await getTranslations("accountArea");
  return <nav aria-label={t("title")} className="mb-8 flex flex-wrap gap-2 border-b border-border pb-4">
    {[["courses", "/account#courses"], ["payments", "/account/course-payments"], ["orders", "/account#orders"], ["profile", "/account#profile"], ...(showManagedLearners ? [["learners", "/account#learners"]] : [])].map(([key, href]) => <Link key={key} href={href} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">{t(key)}</Link>)}
    <AccountSignOut />
  </nav>;
}
