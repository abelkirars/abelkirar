import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/admin/dal";
import { listAdminCustomers } from "@/lib/customer/admin-overview";
import { Container } from "@/components/marketing/container";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdminPage();
  const raw = Number((await searchParams).page ?? 1), page = Number.isSafeInteger(raw) && raw >= 1 && raw <= 10000 ? raw : 1;
  const [customers, t] = await Promise.all([listAdminCustomers(page), getTranslations("customer360")]);
  return <Container className="max-w-5xl space-y-6 py-10"><h1 className="font-heading text-3xl">{t("title")}</h1><p>{t("identityNotice")}</p>
    <div className="space-y-3">{customers.slice(0, 50).map(customer => <Link className="block rounded-xl border p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary" key={customer.id} href={`/admin/customers/${customer.id}`}>{customer.fullName ?? customer.email} · {customer.email} · {customer.status}{customer.archivedAt && ` · ${t("archived")}`}</Link>)}</div>
    <nav className="flex gap-6">{page > 1 && <Link href={`/admin/customers?page=${page - 1}`}>{t("previous")}</Link>}{customers.length > 50 && <Link href={`/admin/customers?page=${page + 1}`}>{t("next")}</Link>}</nav>
  </Container>;
}
