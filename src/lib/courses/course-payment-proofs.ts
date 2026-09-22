import "server-only";

import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const MAX_COURSE_PAYMENT_PROOF_BYTES = 8 * 1024 * 1024;
const BUCKET = process.env.SUPABASE_PAYMENT_SCREENSHOTS_BUCKET || "payment-screenshots";

const FILE_TYPES = {
  "image/png": { extensions: new Set([".png"]), storageExtension: "png" },
  "image/jpeg": { extensions: new Set([".jpg", ".jpeg"]), storageExtension: "jpg" },
  "application/pdf": { extensions: new Set([".pdf"]), storageExtension: "pdf" },
} as const;

export type CoursePaymentProofMimeType = keyof typeof FILE_TYPES;

export type ValidatedCoursePaymentProof = {
  bytes: Uint8Array;
  mimeType: CoursePaymentProofMimeType;
  fileSizeBytes: number;
  originalFileName: string;
  storageExtension: string;
};

export class InvalidCoursePaymentProofError extends Error {}

function includesSequence(haystack: Uint8Array, needle: number[]): boolean {
  outer: for (let start = 0; start <= haystack.length - needle.length; start++) {
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function hasExpectedSignature(mimeType: CoursePaymentProofMimeType, bytes: Uint8Array): boolean {
  if (mimeType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  }
  const header = bytes.slice(0, Math.min(bytes.length, 1024));
  const trailer = bytes.slice(Math.max(0, bytes.length - 1024));
  return includesSequence(header, [0x25, 0x50, 0x44, 0x46, 0x2d])
    && includesSequence(trailer, [0x25, 0x25, 0x45, 0x4f, 0x46]);
}

function safeOriginalFileName(value: string): string {
  const base = path.basename(value).normalize("NFKC").slice(0, 200);
  return base.replace(/[^\p{L}\p{N}._ ()-]/gu, "_") || "payment-proof";
}

export async function validateCoursePaymentProof(file: File): Promise<ValidatedCoursePaymentProof> {
  if (file.size === 0) throw new InvalidCoursePaymentProofError("Choose a non-empty proof file");
  if (file.size > MAX_COURSE_PAYMENT_PROOF_BYTES) {
    throw new InvalidCoursePaymentProofError("Proof files must be 8 MB or smaller");
  }

  const fileType = FILE_TYPES[file.type as CoursePaymentProofMimeType];
  if (!fileType) {
    throw new InvalidCoursePaymentProofError("Use a PNG, JPEG, or PDF file");
  }
  const extension = path.extname(file.name).toLowerCase();
  if (!fileType.extensions.has(extension as never)) {
    throw new InvalidCoursePaymentProofError("The filename extension does not match the file type");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size || !hasExpectedSignature(file.type as CoursePaymentProofMimeType, bytes)) {
    throw new InvalidCoursePaymentProofError("The proof file contents are invalid or do not match its type");
  }

  return {
    bytes,
    mimeType: file.type as CoursePaymentProofMimeType,
    fileSizeBytes: file.size,
    originalFileName: safeOriginalFileName(file.name),
    storageExtension: fileType.storageExtension,
  };
}

export async function uploadCoursePaymentProof(
  paymentId: string,
  submissionId: string,
  proof: ValidatedCoursePaymentProof,
): Promise<string> {
  const storagePath = `course-payments/${paymentId}/${submissionId}/proof.${proof.storageExtension}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, proof.bytes, {
    contentType: proof.mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Failed to store course payment proof: ${error.message}`);
  return storagePath;
}

/** Best-effort compensation for an upload whose database transaction did not win. */
export async function removeCoursePaymentProof(storagePath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
  if (error) console.error("[course-payment-proof] Failed to remove uncommitted proof object", error);
}
