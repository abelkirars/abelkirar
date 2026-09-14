import { MEDIA_BUCKET } from "./site-media-config";

/** Direct-to-storage, signed uploads. No student session or private browser credential. */
export async function uploadWebsiteMedia(
  file: File,
  signed: { path: string; token: string },
  mimeType: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
) {
  const { Upload } = await import("tus-js-client");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("The upload service is not configured.");
  const endpoint = new URL("/storage/v1/upload/resumable", base);
  if (/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname)) {
    endpoint.hostname = endpoint.hostname.replace(".supabase.co", ".storage.supabase.co");
  }
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Upload cancelled.")); return; }
    const cleanup = () => signal.removeEventListener("abort", cancel);
    const upload = new Upload(file, {
      endpoint: endpoint.href,
      headers: { "x-signature": signed.token },
      metadata: { bucketName: MEDIA_BUCKET, objectName: signed.path, contentType: mimeType, cacheControl: "3600" },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      // Avoid retaining signed URLs in browser storage or resuming another admin's upload.
      storeFingerprintForResuming: false,
      onProgress: (sent, total) => onProgress(Math.round(sent / total * 100)),
      onError: (error) => {
        cleanup();
        const status = "originalResponse" in error ? error.originalResponse?.getStatus() : undefined;
        reject(new Error(status === 413 ? "This file exceeds the storage limit. Trim the video and try again."
          : status === 401 || status === 403 ? "Upload permission expired. Please retry; if it continues, sign in again."
          : "Upload interrupted after automatic retries. Check your connection, keep this page open, and try again."));
      },
      onSuccess: () => { cleanup(); resolve(); },
    });
    function cancel() {
      cleanup();
      void upload.abort().catch(() => undefined);
      reject(new Error("Upload cancelled. Your published media has been kept."));
    }
    signal.addEventListener("abort", cancel, { once: true });
    upload.start();
  });
}
