"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { createStudentLoginSchema, type StudentLoginInput } from "@/lib/validations/student-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { syncStudentLocaleOnFirstLogin } from "@/app/actions/sync-student-locale";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

export function StudentLoginForm() {
  const router = useRouter();
  const t = useTranslations("studentLogin");
  const tValidation = useTranslations("validation");
  const tPasswordToggle = useTranslations("passwordToggle");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentLoginInput>({
    resolver: zodResolver(createStudentLoginSchema(tValidation)),
  });

  async function onSubmit(data: StudentLoginInput) {
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setFormError(t("invalidCredentials"));
      return;
    }

    // Best-effort — a failure here should never block getting to the
    // dashboard. requireStudentPage() there re-checks StudentProfile status
    // against the DB and bounces (signing out first) an inactive or orphaned
    // session straight back here with the right ?error=, so this page
    // doesn't need to duplicate that check.
    await syncStudentLocaleOnFirstLogin().catch((err) => {
      console.error("[StudentLoginForm] Failed to sync locale on login:", err);
    });

    router.push("/student/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            showPasswordLabel={tPasswordToggle("show")}
            hidePasswordLabel={tPasswordToggle("hide")}
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>

        <FieldError>{formError}</FieldError>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
