import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Private bucket for student-uploaded practice recordings. Exported (not
 * just a local const) so the sign-upload route can hand the exact bucket
 * name back to the browser, which needs it for uploadToSignedUrl — the
 * browser has no server env access, so the alternative would be hardcoding
 * the name a second time in client code.
 */
export const RECORDING_BUCKET = process.env.SUPABASE_STUDENT_FILES_BUCKET || "student-files";

// 50MB — comfortably covers several minutes of browser-recorded audio
// (MediaRecorder output — webm/opus, m4a) or a short compressed video clip.
export const MAX_RECORDING_BYTES = 50 * 1024 * 1024;

// Client-declared (File.type), checked here before anything is minted —
// this IS the gate, not the mimeType column later stored on
// WeeklyPracticeAttachment (see that field's schema comment).
export const ALLOWED_RECORDING_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/webm",
  "video/mp4",
  "video/quicktime",
]);

const EXTENSION_BY_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export class InvalidRecordingError extends Error {}

/**
 * Mints a one-time signed upload URL for a NEW recording object. The path
 * is entirely server-derived from the (already-authorized) studentId and
 * weeklyPracticeId the caller passes in — never taken from a client
 * request body, and never chosen by the client. mimeType/fileSize are
 * validated here against the CLIENT-DECLARED values, before Supabase is
 * ever called — an early-rejection courtesy, not the real gate.
 * createSignedUploadUrl itself enforces no content-type or size
 * constraint of its own: the browser's direct PUT to Supabase never
 * touches this server, so a client could declare an allowed type/size
 * here and then upload something else entirely. verifyRecordingObject
 * (below) is the real gate, checked at confirm time against what Supabase
 * actually received.
 *
 * The returned token authorizes writing to this ONE path only — it does
 * not require (or grant) any broader storage access, so the browser can
 * safely use it with the anon-key client (see
 * src/components/student/recording-upload.tsx).
 */
export async function createRecordingUploadUrl(
  studentId: string,
  weeklyPracticeId: string,
  file: { mimeType: string; fileSize: number }
): Promise<{ signedUrl: string; token: string; path: string; bucket: string }> {
  if (!ALLOWED_RECORDING_TYPES.has(file.mimeType)) {
    throw new InvalidRecordingError("Unsupported recording type");
  }
  if (file.fileSize > MAX_RECORDING_BYTES) {
    throw new InvalidRecordingError("Recording is too large");
  }

  const extension = EXTENSION_BY_TYPE[file.mimeType] ?? "bin";
  const path = `students/${studentId}/weekly-practice/${weeklyPracticeId}/${randomUUID()}.${extension}`;

  const { data, error } = await supabaseAdmin.storage
    .from(RECORDING_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(`Failed to create signed upload URL: ${error?.message}`);
  }

  return { signedUrl: data.signedUrl, token: data.token, path, bucket: RECORDING_BUCKET };
}

/**
 * Short-lived signed URL for viewing — mint only after the caller has
 * independently verified the requester owns (or administers) this
 * recording. Longer expiry than payment-screenshots.ts/
 * custom-order-images.ts's 300s default: media playback can be paused and
 * resumed over a longer session than a quick glance at a screenshot.
 */
export async function getRecordingSignedUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(RECORDING_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Best-effort deletion of a replaced recording's old object — never
 * throws, matching deleteSupabaseUser's self-logging design. The new
 * upload has already succeeded by the time this runs, so a cleanup
 * failure here must not fail the request that triggered it.
 */
export async function deleteRecordingObject(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(RECORDING_BUCKET).remove([path]);
  if (error) {
    console.error(
      `[student-recordings] Failed to delete old recording object ${path}: ${error.message}`
    );
  }
}

/**
 * Deletes a recording object as part of a full student-account deletion —
 * deliberately NOT deleteRecordingObject above. That one is best-effort
 * cleanup of an object that's already been superseded by a successful new
 * upload, so its own failure must never fail the request that triggered
 * it. Here the situation is the opposite: this runs as the FIRST, gating
 * step of the delete-student flow, specifically so that if it fails,
 * nothing else happens — the StudentProfile row (and the storagePath
 * values on it) still exists, so the failure is recoverable by retrying
 * or cleaning up by hand. Swallowing this failure instead would let the
 * flow proceed to delete the very row that names what still needs
 * cleaning up. Throws rather than logs-and-continues.
 */
export async function deleteRecordingObjectOrThrow(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(RECORDING_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Failed to delete recording object ${path}: ${error.message}`);
  }
}

/**
 * Verifies the ACTUAL uploaded object — both size and content-type —
 * against MAX_RECORDING_BYTES and ALLOWED_RECORDING_TYPES. The mint-time
 * checks in createRecordingUploadUrl only validate CLIENT-DECLARED values,
 * before any upload has happened; a direct-to-Supabase upload never
 * touches this server, and createSignedUploadUrl enforces no content-type
 * or size constraint of its own, so those checks are advisory only. This
 * is the real gate, called from confirmMyRecordingUpload after the
 * browser reports its upload finished.
 *
 * Fails closed: if either value can't be determined at all, that's
 * treated the same as "violates policy," never as "fall back to trusting
 * the client's declared values." Any failure deletes the object rather
 * than leaving it orphaned. Returns the verified values so the caller can
 * store ground truth, not the client's claim.
 */
export async function verifyRecordingObject(
  path: string
): Promise<{ fileSize: number; mimeType: string }> {
  const lastSlash = path.lastIndexOf("/");
  const dir = path.slice(0, lastSlash);
  const fileName = path.slice(lastSlash + 1);

  const { data, error } = await supabaseAdmin.storage
    .from(RECORDING_BUCKET)
    .list(dir, { search: fileName });

  const entry = !error ? data?.find((f) => f.name === fileName) : undefined;
  // Supabase's storage object metadata field is `mimetype` (no camelCase),
  // matching the REST API's own naming — distinct from this project's own
  // `mimeType` (camelCase) column on WeeklyPracticeAttachment.
  const metadata = entry?.metadata as { size?: number; mimetype?: string } | undefined;

  if (!metadata || metadata.size === undefined || metadata.mimetype === undefined) {
    await deleteRecordingObject(path);
    throw new InvalidRecordingError("Could not verify the uploaded recording");
  }

  if (!ALLOWED_RECORDING_TYPES.has(metadata.mimetype)) {
    await deleteRecordingObject(path);
    throw new InvalidRecordingError("Unsupported recording type");
  }

  if (metadata.size > MAX_RECORDING_BYTES) {
    await deleteRecordingObject(path);
    throw new InvalidRecordingError("Recording is too large");
  }

  return { fileSize: metadata.size, mimeType: metadata.mimetype };
}
