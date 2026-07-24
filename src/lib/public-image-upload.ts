import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export class InvalidImageError extends Error {}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Uploads an image to a PUBLIC Supabase Storage bucket (the same
 * "product-images" bucket already used for instrument photos) and returns
 * its public URL. `folder` namespaces uploads within the bucket, e.g.
 * "announcements" or "products".
 */
export async function uploadPublicImage(file: File, folder: string): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new InvalidImageError("Unsupported image type");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new InvalidImageError("Image is too large");
  }

  const extension = EXTENSION_BY_TYPE[file.type] ?? "bin";
  const path = `${folder}/${randomUUID()}.${extension}`;
  const buffer = await file.arrayBuffer();

  const { error } = await supabaseAdmin.storage
    .from("product-images")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/product-images/${path}`;
}

/** Deletes a previously uploaded image given its public URL, if it lives in our bucket. */
export async function deletePublicImage(publicUrl: string): Promise<void> {
  const prefix = `${supabaseUrl}/storage/v1/object/public/product-images/`;
  if (!publicUrl.startsWith(prefix)) return;

  const path = publicUrl.slice(prefix.length);
  await supabaseAdmin.storage.from("product-images").remove([path]);
}
