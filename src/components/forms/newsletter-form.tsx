"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { newsletterSchema, type NewsletterInput } from "@/lib/validations/newsletter";
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
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewsletterInput>({
    resolver: zodResolver(newsletterSchema),
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
    return (
      <p className={className}>Thank you — check your inbox for a welcome note.</p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={className} noValidate>
      <Field orientation="responsive">
        <Input
          type="email"
          placeholder="you@email.com"
          aria-label="Email address"
          {...register("email")}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Joining…" : "Join the community"}
        </Button>
      </Field>
      <FieldError errors={[errors.email]} />
    </form>
  );
}
