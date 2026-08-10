import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = process.env.SUPABASE_CUSTOM_ORDER_IMAGES_BUCKET || "custom-order-images";

export const MAX_CUSTOM_ORDER_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
// JPEG, PNG, and WebP only — no PDF. A Custom Made reference photo is a
// picture of an instrument or design, not a receipt; unlike
// payment-screenshots.ts's ALLOWED_SCREENSHOT_TYPES, PDF is deliberately
// excluded here.
export const ALLOWED_CUSTOM_ORDER_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class InvalidCustomOrderImageError extends Error {}

/**
 * Uploads a customer-submitted Custom Made reference photo to a PRIVATE
 * bucket and returns the object path (not a public URL) — mirrors
 * src/lib/payment-screenshots.ts exactly. Reference photos must only ever
 * be reachable through a signed URL generated after an admin auth check.
 */
export async function uploadCustomOrderImage(
  orderId: string,
  file: File
): Promise<string> {
  if (!ALLOWED_CUSTOM_ORDER_IMAGE_TYPES.has(file.type)) {
    throw new InvalidCustomOrderImageError("Unsupported image type");
  }
  if (file.size > MAX_CUSTOM_ORDER_IMAGE_BYTES) {
    throw new InvalidCustomOrderImageError("Image is too large");
  }

  const extension = EXTENSION_BY_TYPE[file.type] ?? "bin";
  const path = `orders/${orderId}/${randomUUID()}.${extension}`;
  const buffer = await file.arrayBuffer();

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(`Failed to upload custom order image: ${error.message}`);
  }

  return path;
}

/** Short-lived signed URL for admin viewing only — never expose this publicly. */
export async function getCustomOrderImageSignedUrl(
  path: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}
