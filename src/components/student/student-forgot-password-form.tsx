"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  createStudentForgotPasswordSchema,
  type StudentForgotPasswordInput,
} from "@/lib/validations/student-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

export function StudentForgotPasswordForm() {
  const t = useTranslations("studentForgotPassword");
  const tValidation = useTranslations("validation");
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentForgotPasswordInput>({
    resolver: zodResolver(createStudentForgotPasswordSchema(tValidation)),
  });

  async function onSubmit(data: StudentForgotPasswordInput) {
    // The API always answers the same way regardless of outcome (must not
    // leak whether this email is registered) — this form just shows that
    // same confirmation, whether or not the request itself succeeds.
    await fetch("/api/student/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => undefined);
    setSubmitted(true);
  }

  if (submitted) {
    return <p className="text-muted-foreground">{t("confirmation")}</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
