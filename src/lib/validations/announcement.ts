import { z } from "zod";
import { strictBoolean } from "@/lib/validations/boolean";

export const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  eventDate: z.iso.datetime({ offset: true }).or(z.iso.date()).optional().or(z.literal("")),
  published: strictBoolean(true),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;
