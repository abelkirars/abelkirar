import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/dal";
import { Container } from "@/components/marketing/container";
import { AdminLogoutButton } from "@/components/admin/logout-button";

export default async function AuthenticatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminPage();

  return (
    <div>
      <header className="border-b border-border">
        <Container className="flex items-center justify-between py-4">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/admin/orders">Orders</Link>
            <Link href="/admin/upload-images">Upload images</Link>
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
