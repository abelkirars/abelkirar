"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { createContactSchema, type ContactInput } from "@/lib/validations/contact";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";

export function ContactForm({
  topic,
  messagePlaceholder,
  submitLabel,
  successMessage,
  showMessageField = true,
}: {
  topic?: string;
  messagePlaceholder?: string;
  submitLabel?: string;
  successMessage?: string;
  showMessageField?: boolean;
}) {
  const t = useTranslations("contactForm");
  const tValidation = useTranslations("validation");
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(createContactSchema(tValidation)),
    defaultValues: {
      topic,
      message: showMessageField ? "" : `I'd like to be notified about ${topic ?? "this"}.`,
    },
  });

  async function onSubmit(data: ContactInput) {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) setStatus("success");
  }

  if (status === "success") {
    return <p className="text-muted-foreground">{successMessage ?? t("successMessage")}</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
          <Input id="name" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" type="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
          <Input id="phone" type="tel" {...register("phone")} />
        </Field>

        {showMessageField && (
          <Field>
            <FieldLabel htmlFor="message">{t("message")}</FieldLabel>
            <Textarea
              id="message"
              placeholder={messagePlaceholder ?? t("messagePlaceholder")}
              rows={4}
              {...register("message")}
            />
            <FieldError errors={[errors.message]} />
          </Field>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("sending") : (submitLabel ?? t("send"))}
        </Button>
      </FieldGroup>
    </form>
  );
}
