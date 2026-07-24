import { z } from "zod";

export const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  eventDate: z.iso.datetime({ offset: true }).or(z.iso.date()).optional().or(z.literal("")),
  published: z.coerce.boolean().default(true),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;
