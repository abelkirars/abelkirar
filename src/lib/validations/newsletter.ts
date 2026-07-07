import { z } from "zod";

export const newsletterSchema = z.object({
  email: z.email("Enter a valid email address"),
  source: z.string().optional(),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;
