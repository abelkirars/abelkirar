import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/admin/dal";
import { Container } from "@/components/marketing/container";
import { AdminLogoutButton } from "@/components/admin/logout-button";

export default async function AuthenticatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminPage();
  const pricing = await getTranslations("coursePricing");
  const promotions = await getTranslations("coursePromotionAdmin");
  const customers = await getTranslations("customer360");

  return (
    <div>
      <header className="border-b border-border">
        <Container className="flex flex-wrap items-center justify-between gap-4 py-4">
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
            <Link href="/admin/orders">Orders</Link>
            <Link href="/admin/course-applications">Applications</Link>
            <Link href="/admin/course-cohorts">Cohorts</Link>
            <Link href="/admin/course-payments">Course payments</Link>
            <Link href="/admin/course-promotions">{promotions("title")}</Link>
            <Link href="/admin/customers">{customers("title")}</Link>
            <Link href="/admin/students">Students</Link>
            <Link href="/admin/milestones">Milestones</Link>
            <Link href="/admin/products">Products</Link>
            <Link href="/admin/courses">{pricing("nav")}</Link>
            <Link href="/admin/announcements">Announcements</Link>
            <Link href="/admin/upload-images">Upload images</Link>
            <Link href="/admin/content">Website text</Link>
            <Link href="/admin/media">Website media</Link>
            <Link href="/admin/settings">Settings</Link>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{session.displayName}</span>
            <AdminLogoutButton />
          </div>
        </Container>
      </header>
      <main>{children}</main>
    </div>
  );
}
