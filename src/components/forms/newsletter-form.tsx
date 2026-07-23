"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { createNewsletterSchema, type NewsletterInput } from "@/lib/validations/newsletter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";

export function NewsletterForm({
  source,
  className,
}: {
  source?: string;
  className?: string;
}) {
  const t = useTranslations("newsletterForm");
  const tValidation = useTranslations("validation");
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewsletterInput>({
    resolver: zodResolver(createNewsletterSchema(tValidation)),
    defaultValues: { source },
  });

  async function onSubmit(data: NewsletterInput) {
    const res = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setStatus("success");
      reset({ email: "", source });
    }
  }

  if (status === "success") {
    return <p className={className}>{t("success")}</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={className} noValidate>
      <Field orientation="responsive">
        <Input
          type="email"
          placeholder={t("emailPlaceholder")}
          aria-label={t("emailLabel")}
          {...register("email")}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("joining") : t("join")}
        </Button>
      </Field>
      <FieldError errors={[errors.email]} />
    </form>
  );
}
