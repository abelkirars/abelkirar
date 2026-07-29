import { z } from "zod";

type Translator = (key: string) => string;

export function createStudentLoginSchema(t: Translator) {
  return z.object({
    email: z.email(t("enterValidEmail")),
    password: z.string().min(1, t("enterPassword")),
  });
}

export type StudentLoginInput = z.infer<ReturnType<typeof createStudentLoginSchema>>;

export function createStudentForgotPasswordSchema(t: Translator) {
  return z.object({
    email: z.email(t("enterValidEmail")),
  });
}

export type StudentForgotPasswordInput = z.infer<
  ReturnType<typeof createStudentForgotPasswordSchema>
>;

/**
 * Client-side shape only. The 8-character floor here is just a basic sanity
 * check before we even ask Supabase — the real strength/breach enforcement
 * (leaked-password protection, GoTrue's own policy) happens server-side via
 * supabase.auth.updateUser() and is surfaced separately (see
 * /api/student/set-password's weak_password handling).
 */
export function createStudentSetPasswordSchema(t: Translator) {
  return z
    .object({
      password: z.string().min(8, t("passwordMinLength")),
      confirmPassword: z.string().min(1, t("enterPassword")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordsDontMatch"),
      path: ["confirmPassword"],
    });
}

export type StudentSetPasswordInput = z.infer<
  ReturnType<typeof createStudentSetPasswordSchema>
>;
