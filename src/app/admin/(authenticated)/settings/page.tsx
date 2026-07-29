import { Container } from "@/components/marketing/container";
import { ChangePasswordForm } from "@/components/admin/change-password-form";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <section className="py-10">
      <Container className="max-w-md">
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Change your admin password.</p>

        <div className="mt-6 rounded-lg border border-border p-4">
          <ChangePasswordForm />
        </div>
      </Container>
    </section>
  );
}
