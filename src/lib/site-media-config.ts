export const MEDIA_SLOTS = {
  "home-performance": { label: "Homepage performance", types: ["video/mp4", "video/webm", "video/quicktime"], hint: "A short Kirar performance. Aim for 15–30 seconds." },
  "course-sample": { label: "Course sample lesson", types: ["video/mp4", "video/webm", "video/quicktime"], hint: "A 20–30 second sample of your teaching." },
  "kirar-audio": { label: "Kirar audio demonstration", types: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"], hint: "A short audio demonstration for the courses page." },
  "teacher-photo": { label: "Teacher photograph", types: ["image/jpeg", "image/png", "image/webp"], hint: "Your photograph, shown on About and Courses." },
} as const;

export type MediaSlot = keyof typeof MEDIA_SLOTS;
export const MEDIA_BUCKET = "site-media";
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export const MEDIA_EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/ogg": "ogg", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MEDIA_MIME_TYPES = [...new Set(Object.values(MEDIA_SLOTS).flatMap((slot) => [...slot.types])), "application/json"];

/** Safari's Files picker can supply an empty/generic type. Never override an explicit unsupported type. */
export function mediaFileType(file: { name: string; type: string }) {
  const mime = file.type.toLowerCase().split(";")[0].trim();
  if (mime && mime !== "application/octet-stream") return mime === "audio/x-wav" ? "audio/wav" : mime;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpeg") return "image/jpeg";
  return Object.entries(MEDIA_EXTENSIONS).find(([, value]) => value === extension)?.[0] ?? "";
}

export function mediaAccept(slot: MediaSlot) {
  return MEDIA_SLOTS[slot].types.flatMap((type) => [type, `.${MEDIA_EXTENSIONS[type]}`]).join(",");
}

export interface SiteMedia {
  url: string;
  title: string;
  transcript: string;
  mimeType: string;
}

export function isMediaSlot(slot: string): slot is MediaSlot { return Object.hasOwn(MEDIA_SLOTS, slot); }
export function allowedMedia(slot: MediaSlot, mimeType: string, size: number) {
  return (MEDIA_SLOTS[slot].types as readonly string[]).includes(mimeType) && Number.isSafeInteger(size) && size > 0 && size <= MAX_MEDIA_BYTES;
}
