import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ALLOWED_SCREENSHOT_TYPES,
  MAX_SCREENSHOT_BYTES,
} from "@/lib/validations/payment-confirmation";

const BUCKET = process.env.SUPABASE_PAYMENT_SCREENSHOTS_BUCKET || "payment-screenshots";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
};

export class InvalidScreenshotError extends Error {}

/**
 * Uploads a customer-submitted payment screenshot to a PRIVATE bucket and
 * returns the object path (not a public URL) — screenshots must only ever
 * be reachable through a signed URL generated after an admin auth check.
 */
export async function uploadPaymentScreenshot(
  orderId: string,
  file: File
): Promise<string> {
  if (!ALLOWED_SCREENSHOT_TYPES.has(file.type)) {
    throw new InvalidScreenshotError("Unsupported image type");
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    throw new InvalidScreenshotError("Screenshot is too large");
  }

  const extension = EXTENSION_BY_TYPE[file.type] ?? "bin";
  const path = `orders/${orderId}/${randomUUID()}.${extension}`;
  const buffer = await file.arrayBuffer();

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(`Failed to upload payment screenshot: ${error.message}`);
  }

  return path;
}

/** Short-lived signed URL for admin viewing only — never expose this publicly. */
export async function getPaymentScreenshotSignedUrl(
  path: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Deletes every screenshot stored for an order. There is currently no
 * order-deletion feature in the admin dashboard (orders are only ever
 * status-transitioned — Cancelled, etc. — never hard-deleted), so this isn't
 * wired to a UI button. It exists so that any future delete-order feature,
 * or a one-off maintenance script, can clean up storage before/after removing
 * the database rows, instead of leaving orphaned files in the bucket.
 */
export async function deleteOrderScreenshots(orderId: string): Promise<void> {
  const prefix = `orders/${orderId}`;
  const { data: files, error: listError } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(prefix);

  if (listError || !files?.length) return;

  await supabaseAdmin.storage
    .from(BUCKET)
    .remove(files.map((f) => `${prefix}/${f.name}`));
}
