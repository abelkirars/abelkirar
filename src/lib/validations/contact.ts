import { z } from "zod";

type Translator = (key: string) => string;

export function createContactSchema(t: Translator) {
  return z.object({
    name: z.string().min(1, t("enterName")),
    email: z.email(t("enterValidEmail")),
    phone: z.string().optional(),
    topic: z.string().optional(),
    message: z.string().min(1, t("enterMessage")),
  });
}

export type ContactInput = z.infer<ReturnType<typeof createContactSchema>>;
