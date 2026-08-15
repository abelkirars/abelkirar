"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { FieldError } from "@/components/ui/field";

/**
 * The ONE prop this component takes is the assignment's bare id — an
 * opaque identifier, not content (no curriculum data, no title, no
 * instructions). No assignment content, note bodies, submission text,
 * feedback, or any other student data ever reaches this component. See the
 * architecture note in src/app/student/dashboard/page.tsx. It handles an
 * empty file input and two small JSON POSTs plus a direct-to-Supabase
 * upload — never receives, holds, or displays anything about the
 * assignment beyond that id.
 */
export function RecordingUpload({ weeklyPracticeId }: { weeklyPracticeId: string }) {
  const t = useTranslations("studentDashboard");
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const signRes = await fetch("/api/student/recordings/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyPracticeId,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const signData = await signRes.json();
      if (!signRes.ok) {
        setError(signData.error ?? t("recordingGenericError"));
        return;
      }

      // Direct to Supabase, bypassing our own server entirely for the file
      // bytes — see docs/DECISIONS.md / the Stage 8 plan for why a route
      // handler can't carry a recording (Vercel's ~4.5MB body limit).
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(signData.bucket)
        .uploadToSignedUrl(signData.path, signData.token, file);
      if (uploadError) {
        setError(t("recordingGenericError"));
        return;
      }

      const confirmRes = await fetch("/api/student/recordings/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyPracticeId,
          path: signData.path,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        setError(confirmData.error ?? t("recordingGenericError"));
        return;
      }

      router.refresh();
    } catch (err) {
      console.error("[RecordingUpload] upload failed:", err);
      setError(t("recordingGenericError"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 text-sm">
        <span>{t("recordingUploadLabel")}</span>
        <input
          type="file"
          accept="audio/*,video/*"
          disabled={uploading}
          onChange={onFileChange}
          className="text-sm"
        />
      </label>
      {uploading && <p className="text-xs text-muted-foreground">{t("recordingUploading")}</p>}
      <FieldError>{error}</FieldError>
    </div>
  );
}
