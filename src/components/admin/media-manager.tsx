"use client";

import { useState, useEffect, useRef } from "react";
import { MEDIA_SLOTS, allowedMedia, mediaFileType, mediaAccept, MAX_MEDIA_BYTES, type MediaSlot, type SiteMedia } from "@/lib/site-media-config";
import { uploadWebsiteMedia } from "@/lib/site-media-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function MediaEditor({ slot, initial }: { slot: MediaSlot; initial: SiteMedia | null }) {
  const config = MEDIA_SLOTS[slot];
  const fileInput = useRef<HTMLInputElement>(null);
  const [published, setPublished] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [transcript, setTranscript] = useState(initial?.transcript ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const uploaded = useRef<{ file: File; path: string } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!file && published) {
      setBusy(true);
      setStatus("Saving details…");
      try {
        const response = await fetch("/api/admin/media", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, title, transcript }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setPublished(result.media);
        setStatus("Details saved. Your recording has been kept.");
      } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save details. Please retry."); }
      finally { setBusy(false); }
      return;
    }
    const mimeType = file ? mediaFileType(file) : "";
    if (!file || !allowedMedia(slot, mimeType, file.size)) { setStatus("Choose a supported file between 1 byte and 50 MB."); return; }
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      let path = uploaded.current?.file === file ? uploaded.current.path : null;
      if (!path) {
        setStatus("Preparing upload…");
        const signed = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, mimeType, size: file.size }), signal: abort.signal });
        const upload = await signed.json();
        if (!signed.ok) throw new Error(upload.error);
        setStatus("Uploading… Keep this page open.");
        setProgress(0);
        await uploadWebsiteMedia(file, upload, mimeType, setProgress, abort.signal);
        path = upload.path;
        uploaded.current = { file, path: upload.path };
      }
      setProgress(null);
      setStatus("Verifying and publishing…");
      const response = await fetch("/api/admin/media", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, path, title, transcript }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPublished(result.media);
      setFile(null);
      uploaded.current = null;
      setPreview("");
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Published. Your media is now on the website.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Upload failed. Please retry."); }
    finally { setBusy(false); setProgress(null); controller.current = null; }
  }

  async function unpublish() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPublished(null);
      setStatus("Removed from the website. The uploaded file remains in storage.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not unpublish."); }
    finally { setBusy(false); }
  }

  const src = preview || published?.url;
  const mime = (file && mediaFileType(file)) || published?.mimeType || "";
  return <form onSubmit={publish} className="space-y-5 rounded-2xl border bg-card p-5 sm:p-8">
    <div><h2 className="font-heading text-2xl">{config.label}</h2><p className="mt-2 text-sm text-muted-foreground">{config.hint}</p><p className="mt-2 text-sm font-medium">{published ? "Published" : "Not published"}</p></div>
    <div className="space-y-2"><label htmlFor={`${slot}-file`}>1. Choose {slot === "teacher-photo" ? "photograph" : "recording"}</label><Input ref={fileInput} id={`${slot}-file`} type="file" accept={mediaAccept(slot)} disabled={busy} required={!file && !published} onChange={(event) => {
      const next = event.target.files?.[0];
      if (!next) return;
      uploaded.current = null;
      if (allowedMedia(slot, mediaFileType(next), next.size)) {
        setFile(next); setPreview(URL.createObjectURL(next));
        if (!title.trim()) setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").slice(0, 160));
        setStatus("File ready. Check the title below, then tap Upload and publish.");
      } else {
        event.target.value = ""; setFile(null); setPreview("");
        setStatus(next.size > MAX_MEDIA_BYTES ? `This file is ${(next.size / 1024 / 1024).toFixed(1)} MB. The maximum is 50 MB. Trim the video in Photos or export a smaller copy, then select it again.` : "This file format is not supported. For video, choose MP4, MOV (iPhone), or WebM. For photos, choose JPEG, PNG, or WebP.");
      }
    }} /><p className="text-xs text-muted-foreground">Selecting a file does not publish it. Maximum 50 MB.</p>{file && <p className="break-all text-sm font-medium">Selected: {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}</div>
    <div className="space-y-2"><label htmlFor={`${slot}-title`}>Title {slot === "teacher-photo" && "and image description"}</label><Input id={`${slot}-title`} value={title} maxLength={160} required disabled={busy} onChange={(event) => setTitle(event.target.value)} /></div>
    <div className="space-y-2"><label htmlFor={`${slot}-transcript`}>{slot === "teacher-photo" ? "Teacher introduction" : "Transcript or description"}</label><textarea id={`${slot}-transcript`} value={transcript} maxLength={12000} rows={4} disabled={busy} onChange={(event) => setTranscript(event.target.value)} className="w-full rounded-lg border border-input p-3 text-base" /><p className="text-xs text-muted-foreground">Shown below the media. Include spoken words for visitors who cannot hear the recording.</p></div>
    {src && <div className="overflow-hidden rounded-xl bg-muted">{mime.startsWith("image/") ?
      // Local blob previews cannot use Next Image optimization.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={title || "Selected photograph preview"} className="max-h-72 w-full object-contain" /> : mime.startsWith("audio/") ? <audio controls src={src} className="w-full" /> : <video controls playsInline preload="metadata" src={src} className="aspect-video w-full" />}</div>}
    {progress !== null && <div className="space-y-2"><label htmlFor={`${slot}-progress`} className="text-sm">Uploading: {progress}%</label><progress id={`${slot}-progress`} value={progress} max={100} className="h-3 w-full accent-primary" /><p className="text-xs text-muted-foreground">Keep this page open and your iPhone awake. Interrupted chunks retry automatically.</p></div>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={busy || (!file && !published)}>
        {busy ? "Please wait…" : file || !published ? "Upload and publish" : "Save details"}
      </Button>
      {busy && progress !== null && <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>Cancel upload</Button>}
      {file && <Button type="button" variant="outline" disabled={busy} onClick={() => {
        setFile(null);
        uploaded.current = null;
        setPreview("");
        if (fileInput.current) fileInput.current.value = "";
        setStatus("File selection cleared.");
      }}>Clear selected file</Button>}
      {published && <Button type="button" variant="outline" disabled={busy} onClick={unpublish}>Unpublish</Button>}
    </div>
    <p role="status" aria-live="polite" className="text-sm">{status}</p>
  </form>;
}

export function MediaManager({ initialMedia }: { initialMedia: Partial<Record<MediaSlot, SiteMedia | null>> }) {
  return <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
    <h1 className="font-heading text-3xl">Website media</h1>
    <p className="mt-3 max-w-2xl text-muted-foreground">Choose a file, check its title, then tap Upload and publish. You can edit published titles and transcripts without uploading again. MP4, MOV (iPhone), or WebM for video; maximum 50 MB per file.</p>
    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">For videos that play on the widest range of devices, use H.264 MP4. On iPhone, Settings → Camera → Formats → Most Compatible applies to new recordings. Existing High Efficiency videos may need conversion for some visitors’ browsers.</p>
    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">This library is for public website media. Uploaded files are publicly accessible. Student recordings stay in the private student portal.</p>
    <p className="mt-3 max-w-2xl rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm font-medium">Public previews only. Keep full lessons, paid recordings, workbooks, teaching methods, and the curriculum manual out of this library, including titles and transcripts.</p>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">{(Object.keys(MEDIA_SLOTS) as MediaSlot[]).map((slot) => <MediaEditor key={slot} slot={slot} initial={initialMedia[slot] ?? null} />)}</div>
  </div>;
}
