"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

export function AccountLoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const t = useTranslations("coursePaymentLogin");
  const tPassword = useTranslations("passwordToggle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string") {
      setError(t("invalidCredentials"));
      setLoading(false);
      return;
    }
    const { error: signInError } = await createSupabaseBrowserClient().auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(t("invalidCredentials"));
      setLoading(false);
      return;
    }
    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="account-email">{t("email")}</FieldLabel>
          <Input id="account-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-password">{t("password")}</FieldLabel>
          <PasswordInput
            id="account-password"
            name="password"
            autoComplete="current-password"
            showPasswordLabel={tPassword("show")}
            hidePasswordLabel={tPassword("hide")}
            required
          />
        </Field>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={loading}>
          {loading ? t("submitting") : t("submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
