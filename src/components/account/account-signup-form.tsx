"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

export function AccountSignupForm() {
  const t = useTranslations("accountSignup"), passwordText = useTranslations("passwordToggle");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "busy") return;
    const data = new FormData(event.currentTarget);
    setState("busy");
    try {
      const auth = createSupabaseBrowserClient().auth;
      const result = await auth.signUp({
        email: String(data.get("email") ?? "").trim(), password: String(data.get("password") ?? ""),
        options: { emailRedirectTo: new URL("/account/confirm", window.location.origin).toString() },
      });
      // Confirmation must stay enabled in Supabase. Do not treat an immediate
      // session as proof of a user completing the required confirmation flow.
      if (result.data.session) { await auth.signOut({ scope: "local" }); setState("error"); return; }
      if (result.error && result.error.code !== "user_already_exists") { setState("error"); return; }
      setState("sent");
    } catch { setState("error"); }
  }
  if (state === "sent") return <p role="status">{t("sent")}</p>;
  return <form onSubmit={submit} className="space-y-5">
    <label className="block space-y-2"><span>{t("email")}</span><Input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    <label className="block space-y-2"><span>{t("password")}</span><PasswordInput name="password" autoComplete="new-password" minLength={8} required showPasswordLabel={passwordText("show")} hidePasswordLabel={passwordText("hide")} /></label>
    <p className="text-sm text-muted-foreground">{t("notice")}</p>
    {state === "error" && <p role="alert" className="text-sm text-destructive">{t("error")}</p>}
    <Button type="submit" disabled={state === "busy"}>{t(state === "busy" ? "busy" : "submit")}</Button>
  </form>;
}
