"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function AccountSignOut() {
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const router = useRouter(), t = useTranslations("accountArea");
  async function signOut() {
    setBusy(true); setFailed(false);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/account/login"); router.refresh();
    } catch { setFailed(true); setBusy(false); }
  }
  return <div><button type="button" disabled={busy} onClick={signOut} className="rounded-lg px-3 py-2 text-sm font-medium underline focus-visible:outline-2 focus-visible:outline-primary">{t("signOut")}</button>{failed && <p role="alert" className="text-sm">{t("signOutError")}</p>}</div>;
}
