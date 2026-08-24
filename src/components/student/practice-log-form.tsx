"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  createPracticeLogEntrySchema,
  type PracticeLogEntryInput,
} from "@/lib/validations/practice-log-entry";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import {
  normalizePracticeSelfRating,
  PRACTICE_SELF_RATING_OPTIONS,
} from "@/lib/student/practice-self-ratings";

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PracticeLogForm() {
  const t = useTranslations("studentDashboard");
  const tValidation = useTranslations("validation");
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PracticeLogEntryInput>({
    resolver: zodResolver(createPracticeLogEntrySchema(tValidation)),
    defaultValues: {
      practicedAt: todayDateOnly(),
      focus: "",
      selfRating: "",
    },
  });

  // useWatch, not the imperative watch() from useForm() — the latter can't
  // be safely memoized by the React Compiler (see eslint react-hooks/
  // incompatible-library) and this component is otherwise compiler-eligible.
  const selfRating = useWatch({ control, name: "selfRating" });

  async function onSubmit(data: PracticeLogEntryInput) {
    setSubmitError(null);
    try {
      // The input shows a localized suggestion, while the API continues to
      // receive the existing stable English value. Custom free text passes
      // through untouched and remains intentionally unscored.
      const res = await fetch("/api/student/practice-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          selfRating: normalizePracticeSelfRating(data.selfRating, (key) => t(key)),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSubmitError(result.error ?? t("practiceLogGenericError"));
        return;
      }
      reset({ practicedAt: todayDateOnly(), durationMinutes: undefined, focus: "", selfRating: "" });
      router.refresh();
    } catch (err) {
      console.error("[PracticeLogForm] submit failed:", err);
      setSubmitError(t("practiceLogGenericError"));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup className="gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="practicedAt">{t("practiceLogDateLabel")}</FieldLabel>
            <Input
              id="practicedAt"
              type="date"
              className="h-11 rounded-xl bg-card"
              {...register("practicedAt")}
            />
            <FieldError errors={[errors.practicedAt]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="durationMinutes">
              {t("practiceLogDurationLabel")}
            </FieldLabel>
            <Input
              id="durationMinutes"
              type="number"
              min={1}
              max={600}
              inputMode="numeric"
              className="h-11 rounded-xl bg-card"
              {...register("durationMinutes", { valueAsNumber: true })}
            />
            <FieldError errors={[errors.durationMinutes]} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="focus">{t("practiceLogFocusLabel")}</FieldLabel>
          <Input id="focus" className="h-11 rounded-xl bg-card" {...register("focus")} />
          <FieldError errors={[errors.focus]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="selfRating">{t("practiceLogSelfRatingLabel")}</FieldLabel>
          <Input
            id="selfRating"
            className="h-11 rounded-xl bg-card"
            {...register("selfRating")}
          />
          <div className="flex flex-wrap gap-2">
            {PRACTICE_SELF_RATING_OPTIONS.map((option) => {
              const label = t(option.messageKey);
              const isActive = selfRating === label;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setValue("selfRating", label, { shouldValidate: true })}
                  aria-pressed={isActive}
                  className="min-h-11 rounded-full border border-input bg-card px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:border-secondary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[active=true]:border-secondary data-[active=true]:bg-secondary data-[active=true]:text-secondary-foreground"
                  data-active={isActive}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <FieldError errors={[errors.selfRating]} />
        </Field>

        <FieldError>{submitError}</FieldError>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="min-h-11 w-full rounded-xl px-5 sm:w-auto sm:min-w-40 sm:self-start"
        >
          {isSubmitting ? t("practiceLogSubmitting") : t("practiceLogSubmit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
