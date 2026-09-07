"use client";

import { useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
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

/**
 * Classes copied verbatim from src/components/ui/input.tsx's current
 * className, since there is no shared constant for it — these native selects
 * have no equivalent Select-primitive wrapper to inherit styling from the way
 * Input and Textarea do. This can drift from Input's own classes if that file
 * changes without this one being updated to match.
 */
const SELECT_CLASSES =
  "h-12 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

export function CourseApplicationForm({
  defaultRequestedLevel,
}: {
  /**
   * Pre-selects the level question. Passed by the course detail pages, which
   * know which course the applicant navigated to — someone who opened
   * /courses/intermediate has already stated their level, and asking them to
   * re-enter it is friction with no benefit. "Not sure yet" stays selectable,
   * which is the actual safeguard against a wrong pre-fill being confirmed.
   *
   * Omitted on /courses, where no level has been implied.
   */
  defaultRequestedLevel?: CreateCourseApplicationInput["requestedLevel"];
} = {}) {
  const t = useTranslations("courseApplicationForm");
  const tValidation = useTranslations("validation");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  // normalizeOptionalFields runs on the raw form values BEFORE zod validates
  // them, wrapping zodResolver rather than being baked into the shared schema
  // (see course-application.ts for why). It maps untouched optional text
  // fields to undefined; it deliberately does NOT touch the required choice
  // fields, so an unanswered select fails with "please choose one" rather than
  // silently becoming a missing value.
  const zodResolverFn = zodResolver(createCourseApplicationSchema(tValidation));
  const resolver: Resolver<CreateCourseApplicationInput> = (values, context, options) =>
    zodResolverFn(normalizeOptionalFields(values), context, options);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateCourseApplicationInput>({
    resolver,
    // The level <select> carries no defaultValue attribute of its own — that
    // would be a second, competing source of the initial value and would win
    // over this one at first render. With no prop, requestedLevel is undefined,
    // which matches no option, so the browser falls back to the first option in
    // source order: the empty "Choose one" placeholder.
    defaultValues: { requestedLevel: defaultRequestedLevel },
  });

  // useWatch rather than watch(): watch() returns a fresh function on every
  // render and cannot be memoized safely, which the react-hooks lint rule
  // flags. useWatch subscribes to this one field instead.
  //
  // Compared with === true, never truthiness: the field is undefined until the
  // applicant answers, and "unanswered" must not render as "an adult applied".
  const isUnder15 = useWatch({ control, name: "isUnder15" }) === true;

  async function onSubmit(data: CreateCourseApplicationInput) {
    // The applicant's own phone is not collected for an under-15 application —
    // the field is not rendered, and any value typed before the answer changed
    // is dropped here rather than sent and discarded server-side. The server
    // nulls it regardless; this just means it never leaves the browser.
    const payload = normalizeOptionalFields(
      data.isUnder15 === true ? { ...data, phone: undefined } : data
    );

    try {
      const res = await fetch("/api/course-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Never inspect or surface the response body, status code, or any
      // exception here — the banner text is a single static translated string
      // regardless of why the request failed.
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
          <Input id="fullName" autoComplete="name" {...register("fullName")} />
          <FieldError errors={[errors.fullName]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="country">{t("country")}</FieldLabel>
          <Input
            id="country"
            autoComplete="country-name"
            placeholder={t("countryPlaceholder")}
            {...register("country")}
          />
          <FieldError errors={[errors.country]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="isUnder15">{t("ageGroupLabel")}</FieldLabel>
          {/* Asked before the contact fields because it changes what they mean:
              for an under-15 application the address collected is the parent's,
              and the applicant's own phone is not collected at all. */}
          <select
            id="isUnder15"
            aria-invalid={Boolean(errors.isUnder15)}
            className={SELECT_CLASSES}
            {...register("isUnder15", {
              // The wire contract is a boolean; a <select> can only yield a
              // string. Converting here keeps the schema free of z.preprocess
              // and keeps the server's contract strict — it accepts booleans
              // only, never "yes"/"no".
              setValueAs: (value) => (value === "" ? undefined : value === "yes"),
            })}
          >
            <option value="">{t("chooseOne")}</option>
            <option value="no">{t("ageGroup15OrOver")}</option>
            <option value="yes">{t("ageGroupUnder15")}</option>
          </select>
          <FieldError errors={[errors.isUnder15]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">{isUnder15 ? t("emailGuardian") : t("email")}</FieldLabel>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        {/* Hidden entirely for an under-15 application rather than relabelled:
            the guardian block below already asks for the parent's number as a
            required field, and showing two boxes with the same label produces
            either a duplicate or a blank, never better data. */}
        {!isUnder15 && (
          <Field>
            <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder={t("phonePlaceholder")}
              {...register("phone")}
            />
            <FieldError errors={[errors.phone]} />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="lessonLanguage">{t("lessonLanguage")}</FieldLabel>
          <select
            id="lessonLanguage"
            aria-invalid={Boolean(errors.lessonLanguage)}
            className={SELECT_CLASSES}
            {...register("lessonLanguage")}
          >
            <option value="">{t("chooseOne")}</option>
            <option value="AM">{t("languageAmharic")}</option>
            <option value="EN">{t("languageEnglish")}</option>
            <option value="EITHER">{t("languageEither")}</option>
          </select>
          <FieldError errors={[errors.lessonLanguage]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="requestedLevel">{t("requestedLevel")}</FieldLabel>
          {/* "Not sure yet" is a real, selectable answer — UNSURE on the wire,
              mapped to null server-side. It is NOT the empty placeholder: the
              question is mandatory, so leaving it unanswered is an error while
              answering "not sure" is not. */}
          <select
            id="requestedLevel"
            aria-invalid={Boolean(errors.requestedLevel)}
            className={SELECT_CLASSES}
            {...register("requestedLevel")}
          >
            <option value="">{t("chooseOne")}</option>
            <option value="BEGINNER">{t("levelBeginner")}</option>
            <option value="INTERMEDIATE">{t("levelIntermediate")}</option>
            <option value="ADVANCED">{t("levelAdvanced")}</option>
            <option value="UNSURE">{t("levelNotSure")}</option>
          </select>
          <FieldError errors={[errors.requestedLevel]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="kirarModel">{t("kirarModel")}</FieldLabel>
          <select
            id="kirarModel"
            aria-invalid={Boolean(errors.kirarModel)}
            className={SELECT_CLASSES}
            {...register("kirarModel")}
          >
            <option value="">{t("chooseOne")}</option>
            <option value="FIVE_STRING">{t("modelFiveString")}</option>
            <option value="SIX_STRING">{t("modelSixString")}</option>
            <option value="NONE_YET">{t("modelNoneYet")}</option>
            <option value="UNSURE">{t("modelUnsure")}</option>
          </select>
          <FieldError errors={[errors.kirarModel]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="applicantMessage">{t("applicantMessage")}</FieldLabel>
          <Textarea
            id="applicantMessage"
            rows={4}
            placeholder={t("applicantMessagePlaceholder")}
            {...register("applicantMessage")}
          />
          <FieldError errors={[errors.applicantMessage]} />
        </Field>

        {/* The ONLY conditional section in this form. Rendering is a
            convenience for the applicant, not the enforcement: the same schema
            requires all four answers on the server whenever isUnder15 is true,
            because a fieldset the browser hides proves nothing about what was
            actually POSTed. */}
        {isUnder15 && (
          <fieldset className="rounded-xl bg-muted/40 p-4">
            <legend className="px-1 text-sm font-semibold">{t("guardianHeading")}</legend>
            <p className="mb-4 text-sm text-muted-foreground">{t("guardianHint")}</p>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="guardianName">{t("guardianName")}</FieldLabel>
                <Input
                  id="guardianName"
                  autoComplete="section-guardian name"
                  {...register("guardianName")}
                />
                <FieldError errors={[errors.guardianName]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="guardianRelationship">{t("guardianRelationship")}</FieldLabel>
                <select
                  id="guardianRelationship"
                  aria-invalid={Boolean(errors.guardianRelationship)}
                  className={SELECT_CLASSES}
                  {...register("guardianRelationship")}
                >
                  <option value="">{t("chooseOne")}</option>
                  <option value="Parent">{t("relationshipParent")}</option>
                  <option value="Guardian">{t("relationshipGuardian")}</option>
                </select>
                <FieldError errors={[errors.guardianRelationship]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="guardianPhone">{t("guardianPhoneLabel")}</FieldLabel>
                <Input
                  id="guardianPhone"
                  type="tel"
                  autoComplete="section-guardian tel"
                  placeholder={t("phonePlaceholder")}
                  {...register("guardianPhone")}
                />
                <FieldError errors={[errors.guardianPhone]} />
              </Field>

              <Field>
                {/* A plain checkbox rather than the Base UI Checkbox
                    primitive, which is not a native input and would need a
                    Controller to participate in react-hook-form. Consent is
                    the one answer that must not depend on extra wiring. */}
                <label className="flex items-start gap-3 text-sm" htmlFor="guardianConsent">
                  <input
                    id="guardianConsent"
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    aria-invalid={Boolean(errors.guardianConsent)}
                    {...register("guardianConsent")}
                  />
                  <span>{t("guardianConsent")}</span>
                </label>
                <FieldError errors={[errors.guardianConsent]} />
              </Field>
            </FieldGroup>
          </fieldset>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("submitting") : t("submit")}
        </Button>

        <p className="text-xs text-muted-foreground">{t("privacyNote")}</p>
      </FieldGroup>
    </form>
  );
}
