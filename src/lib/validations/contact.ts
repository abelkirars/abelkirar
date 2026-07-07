import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(1, "Enter your name"),
  email: z.email("Enter a valid email address"),
  phone: z.string().optional(),
  topic: z.string().optional(),
  message: z.string().min(1, "Tell us a little about what you need"),
});

export type ContactInput = z.infer<typeof contactSchema>;
