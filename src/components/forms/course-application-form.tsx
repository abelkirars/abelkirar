"use client";

import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  createCourseApplicationSchema,
  normalizeOptionalFields,
  type CreateCourseApplicationInput,
} from "@/lib/validations/course-application";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

export function CourseApplicationForm({
  defaultRequestedLevel,
}: {
  defaultRequestedLevel?: CreateCourseApplicationInput["requestedLevel"];
} = {}) {
  const t = useTranslations("courseApplicationForm");
  const tValidation = useTranslations("validation");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  // normalizeOptionalFields runs on the raw form values BEFORE zod
  // validates them, wrapping zodResolver rather than being baked into the
  // shared schema (see course-application.ts for why). This is what lets
  // the "Not sure yet" <option value=""> pass validation as a deliberate
  // empty selection instead of failing the enum check.
  const zodResolverFn = zodResolver(createCourseApplicationSchema(tValidation));
  const resolver: Resolver<CreateCourseApplicationInput> = (values, context, options) =>
    zodResolverFn(normalizeOptionalFields(values), context, options);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateCourseApplicationInput>({
    resolver,
    // The <select> below intentionally carries no defaultValue attribute —
    // that would be a second, competing source of the field's initial
    // value and would win over this one at first render. With no prop,
    // requestedLevel is undefined here, and undefined does not match any
    // option's value, so the browser falls back to the first <option> in
    // source order — the "" / "Not sure yet" option — exactly the same
    // outcome as before this prop existed.
    defaultValues: { requestedLevel: defaultRequestedLevel },
  });

  async function onSubmit(data: CreateCourseApplicationInput) {
    try {
      const res = await fetch("/api/course-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Same helper, same normalization, applied again here since `data`
        // is the resolver's already-validated output — this keeps the
        // wire payload's shape identical to what the schema produced,
        // rather than relying on the server to re-derive it.
        body: JSON.stringify(normalizeOptionalFields(data)),
      });
      // Never inspect or surface the response body, status code, or any
      // exception here — the banner text is a single static translated
      // string regardless of why the request failed.
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return <p className="text-muted-foreground">{t("successMessage")}</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {status === "error" && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {t("submissionError")}
        </p>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="fullName">{t("fullName")}</FieldLabel>
          <Input id="fullName" {...register("fullName")} />
          <FieldError errors={[errors.fullName]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" type="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
          <Input id="phone" type="tel" {...register("phone")} />
          <FieldError errors={[errors.phone]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="requestedLevel">{t("requestedLevel")}</FieldLabel>
          {/* Classes copied verbatim from src/components/ui/input.tsx's current
              className, since there is no shared constant for it — this native
              select has no equivalent Select-primitive wrapper to inherit
              styling from the way Input/Textarea do. This can drift from
              Input's own classes if that file changes without this one being
              updated to match. */}
          <select
            id="requestedLevel"
            {...register("requestedLevel")}
            aria-invalid={Boolean(errors.requestedLevel)}
            className="h-12 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
          >
            <option value="">{t("levelNotSure")}</option>
            <option value="BEGINNER">{t("levelBeginner")}</option>
            <option value="INTERMEDIATE">{t("levelIntermediate")}</option>
            <option value="ADVANCED">{t("levelAdvanced")}</option>
          </select>
        </Field>

        <Field>
          <FieldLabel htmlFor="applicantMessage">{t("applicantMessage")}</FieldLabel>
          <Textarea id="applicantMessage" rows={4} {...register("applicantMessage")} />
          <FieldError errors={[errors.applicantMessage]} />
        </Field>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
