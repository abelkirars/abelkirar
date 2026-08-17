"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Mirrors AdminLogoutButton exactly (src/components/admin/logout-button.tsx)
// — same shape, same POST-then-redirect-then-refresh sequence, reusing the
// existing POST /api/student/logout route rather than a second mechanism.
// Redirects to /student/login, not the homepage: matches the admin
// convention, and lets a student who logged out by mistake sign straight
// back in from the same page they landed on.
export function StudentLogoutButton() {
  const router = useRouter();
  const t = useTranslations("studentDashboard");

  async function handleLogout() {
    await fetch("/api/student/logout", { method: "POST" });
    router.push("/student/login");
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" onClick={handleLogout}>
      {t("logOut")}
    </Button>
  );
}
