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

// Hardcoded client-side only, per the Stage 6 decision — free text with
// suggestions, not a controlled enum. No admin editor for this list; nobody
// asked for one, and selfRating stays a plain nullable string on the model
// (see the schema comment on PracticeLogEntry.selfRating) specifically so it
// can never be averaged into a score.
const SELF_RATING_SUGGESTIONS = [
  "Focused",
  "Rushed",
  "Distracted",
  "Difficult",
  "Enjoyable",
  "Frustrating",
  "Steady",
  "Breakthrough",
] as const;

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
      const res = await fetch("/api/student/practice-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FieldGroup>
        <Field orientation="responsive">
          <FieldLabel htmlFor="practicedAt">{t("practiceLogDateLabel")}</FieldLabel>
          <Input id="practicedAt" type="date" {...register("practicedAt")} />
          <FieldError errors={[errors.practicedAt]} />
        </Field>

        <Field orientation="responsive">
          <FieldLabel htmlFor="durationMinutes">{t("practiceLogDurationLabel")}</FieldLabel>
          <Input
            id="durationMinutes"
            type="number"
            min={1}
            max={600}
            {...register("durationMinutes", { valueAsNumber: true })}
          />
          <FieldError errors={[errors.durationMinutes]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="focus">{t("practiceLogFocusLabel")}</FieldLabel>
          <Input id="focus" {...register("focus")} />
          <FieldError errors={[errors.focus]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="selfRating">{t("practiceLogSelfRatingLabel")}</FieldLabel>
          <Input id="selfRating" {...register("selfRating")} />
          <div className="flex flex-wrap gap-1.5">
            {SELF_RATING_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setValue("selfRating", suggestion, { shouldValidate: true })}
                className="rounded-full border border-input px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground data-[active=true]:border-ring data-[active=true]:text-foreground"
                data-active={selfRating === suggestion}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <FieldError errors={[errors.selfRating]} />
        </Field>

        <FieldError>{submitError}</FieldError>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("practiceLogSubmitting") : t("practiceLogSubmit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
