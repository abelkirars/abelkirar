"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  createStudentSetPasswordSchema,
  type StudentSetPasswordInput,
} from "@/lib/validations/student-auth";
import { Container } from "@/components/marketing/container";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

type LinkStatus = "loading" | "ready" | "invalid";

/**
 * Both invite and recovery links land here the same way (confirmed
 * empirically): GoTrue's /auth/v1/verify redirects to this exact URL with
 * the session tokens in the hash fragment —
 * #access_token=...&refresh_token=...&expires_in=...&token_type=bearer&type=invite|recovery
 * — never a `code` query param (no PKCE — the admin API has no way to
 * attach a code_challenge) and never `token_hash`+`type` (that shape is only
 * produced by verifyOtp()'s own flow, which nothing here uses). An expired
 * or already-used link instead redirects with #error=access_denied&error_code=...
 *
 * The fragment never reaches a server on its own, so this page reads it
 * itself on mount, then POSTs the tokens to /api/student/set-password in one
 * request — that route calls setSession() + updateUser() server-side. This
 * component never touches the Supabase JS SDK at all, which sidesteps a real
 * pitfall found during investigation: @supabase/ssr's browser/server clients
 * both hard-default to flowType "pkce", and GoTrueClient's own
 * detectSessionInUrl auto-detection throws AuthPKCEGrantCodeExchangeError
 * when it sees this implicit-shaped hash while configured for pkce. Manual
 * parsing + a single server-side setSession() avoids that mismatch entirely.
 */
export default function StudentSetPasswordPage() {
  const router = useRouter();
  const t = useTranslations("studentSetPassword");
  const tValidation = useTranslations("validation");
  const tPasswordToggle = useTranslations("passwordToggle");
  const [status, setStatus] = useState<LinkStatus>("loading");
  const [tokens, setTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Reads window.location.hash — an external, SSR-unavailable source that
  // GoTrue's redirect populates once, at mount. There's no way to derive
  // this during render (no `window` on the server) and nothing to compute it
  // from except that one-time browser-only read, so an effect synchronizing
  // React state with it is the correct tool here, not a derived-render-value
  // case the lint rule is meant to catch.
  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const hasError = params.get("error");

    // Strip the tokens out of the URL immediately regardless of outcome —
    // they must not linger in the address bar or browser history.
    window.history.replaceState(null, "", window.location.pathname);

    if (hasError || !accessToken || !refreshToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("invalid");
      return;
    }

    setTokens({ accessToken, refreshToken });
    setStatus("ready");
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentSetPasswordInput>({
    resolver: zodResolver(createStudentSetPasswordSchema(tValidation)),
  });

  async function onSubmit(data: StudentSetPasswordInput) {
    if (!tokens) return;
    setFormError(null);

    const res = await fetch("/api/student/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        password: data.password,
        confirmPassword: data.confirmPassword,
      }),
    });

    if (res.ok) {
      router.push("/student/dashboard");
      return;
    }

    const responseBody = await res.json().catch(() => ({ error: "unknown" }));
    if (responseBody.error === "invalid_or_expired_link") {
      setStatus("invalid");
      return;
    }
    if (responseBody.error === "account_inactive") {
      setFormError(t("errorAccountInactive"));
      return;
    }
    if (responseBody.error === "weak_password") {
      const reasons: string[] = responseBody.reasons ?? [];
      setFormError(
        reasons.includes("pwned") ? t("errorWeakPasswordBreached") : t("errorWeakPasswordGeneric")
      );
      return;
    }
    setFormError(t("errorGeneric"));
  }

  return (
    <section className="py-16 sm:py-24">
      <Container className="max-w-md">
        <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>

        {status === "invalid" && (
          <div className="mt-6">
            <p className="font-medium text-destructive">{t("invalidLinkTitle")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("invalidLinkBody")}</p>
            <Link
              href="/student/forgot-password"
              className="mt-4 inline-block text-sm text-accent hover:underline"
            >
              {t("requestNewLink")}
            </Link>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  showPasswordLabel={tPasswordToggle("show")}
                  hidePasswordLabel={tPasswordToggle("hide")}
                  {...register("password")}
                />
                <FieldError errors={[errors.password]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword">{t("confirmPassword")}</FieldLabel>
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  showPasswordLabel={tPasswordToggle("show")}
                  hidePasswordLabel={tPasswordToggle("hide")}
                  {...register("confirmPassword")}
                />
                <FieldError errors={[errors.confirmPassword]} />
              </Field>

              <FieldError>{formError}</FieldError>

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("submitting") : t("submit")}
              </Button>
            </FieldGroup>
          </form>
        )}
      </Container>
    </section>
  );
}
