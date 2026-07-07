"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ContactInput } from "@/lib/validations/contact";
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
  messagePlaceholder = "Tell us a bit about what you're looking for…",
  submitLabel = "Send",
  successMessage = "Thank you — we'll be in touch soon.",
  showMessageField = true,
}: {
  topic?: string;
  messagePlaceholder?: string;
  submitLabel?: string;
  successMessage?: string;
  showMessageField?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
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
    return <p className="text-muted-foreground">{successMessage}</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
          <Input id="phone" type="tel" {...register("phone")} />
        </Field>

        {showMessageField && (
          <Field>
            <FieldLabel htmlFor="message">Message</FieldLabel>
            <Textarea
              id="message"
              placeholder={messagePlaceholder}
              rows={4}
              {...register("message")}
            />
            <FieldError errors={[errors.message]} />
          </Field>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : submitLabel}
        </Button>
      </FieldGroup>
    </form>
  );
}
