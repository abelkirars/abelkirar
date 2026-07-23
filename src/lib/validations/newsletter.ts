import { z } from "zod";

type Translator = (key: string) => string;

export function createNewsletterSchema(t: Translator) {
  return z.object({
    email: z.email(t("enterValidEmail")),
    source: z.string().optional(),
  });
}

export type NewsletterInput = z.infer<ReturnType<typeof createNewsletterSchema>>;
