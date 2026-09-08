import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteMedia } from "@/lib/site-media";
import { MEDIA_BUCKET, MEDIA_EXTENSIONS, MEDIA_SLOTS, MAX_MEDIA_BYTES, isMediaSlot, allowedMedia } from "@/lib/site-media-config";

const slotSchema = z.string().refine(isMediaSlot);
const uploadSchema = z.object({ slot: slotSchema, mimeType: z.string(), size: z.number().int().positive() }).strict();
const publishSchema = z.object({ slot: slotSchema, path: z.string(), title: z.string().trim().min(1).max(160), transcript: z.string().trim().max(12000) }).strict();
const editSchema = publishSchema.omit({ path: true });

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminApi();
    if ("response" in auth) return auth.response;
    const parsed = editSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isMediaSlot(parsed.data.slot)) return Response.json({ error: "Check the title and media details." }, { status: 400 });
    const { slot, title, transcript } = parsed.data;
    const current = await getSiteMedia(slot);
    if (!current) return Response.json({ error: "Published media could not be loaded. Refresh the page and try again." }, { status: 409 });
    const media = { ...current, title, transcript };
    const { error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).upload(`published/${slot}.json`, JSON.stringify(media), { contentType: "application/json", cacheControl: "0", upsert: true });
    if (error) throw error;
    return Response.json({ media });
  } catch {
    return Response.json({ error: "Could not save the details. Please retry." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi();
    if ("response" in auth) return auth.response;
    const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isMediaSlot(parsed.data.slot) || !allowedMedia(parsed.data.slot, parsed.data.mimeType, parsed.data.size)) return Response.json({ error: "Choose a supported file up to 50 MB." }, { status: 400 });
    const { slot, mimeType } = parsed.data;
    const { data: bucket, error: bucketError } = await supabaseAdmin.storage.getBucket(MEDIA_BUCKET);
    if (!bucket) {
      if (bucketError && String(bucketError.statusCode) !== "404") throw bucketError;
      const { error } = await supabaseAdmin.storage.createBucket(MEDIA_BUCKET, {
        public: true, fileSizeLimit: MAX_MEDIA_BYTES,
        allowedMimeTypes: [...new Set(Object.values(MEDIA_SLOTS).flatMap((s) => [...s.types])), "application/json"],
      });
      if (error && String(error.statusCode) !== "409") throw error;
    }
    const path = `uploads/${auth.session.adminId}/${slot}/${randomUUID()}.${MEDIA_EXTENSIONS[mimeType]}`;
    const { data, error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return Response.json({ path, token: data.token }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Upload service unavailable. Check your database and storage connection, then retry." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApi();
    if ("response" in auth) return auth.response;
    const parsed = publishSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isMediaSlot(parsed.data.slot)) return Response.json({ error: "Check the title and media details." }, { status: 400 });
    const { slot, path, title, transcript } = parsed.data;
    const prefix = `uploads/${auth.session.adminId}/${slot}/`;
    const filename = path.slice(prefix.length);
    if (!path.startsWith(prefix) || !/^[a-f0-9-]{36}\.(mp4|webm|mp3|m4a|wav|ogg|jpg|png|webp)$/.test(filename)) return Response.json({ error: "Invalid upload path." }, { status: 400 });
    const storage = supabaseAdmin.storage.from(MEDIA_BUCKET);
    const { data, error } = await storage.list(prefix.slice(0, -1), { search: filename });
    if (error) throw error;
    const metadata = data?.find((item) => item.name === filename)?.metadata;
    if (!metadata || !allowedMedia(slot, metadata.mimetype, metadata.size)) return Response.json({ error: "The uploaded file could not be verified. Upload it again." }, { status: 400 });
    const { data: publicData } = storage.getPublicUrl(path);
    const media = { url: publicData.publicUrl, title, transcript, mimeType: metadata.mimetype };
    const { error: publishError } = await storage.upload(`published/${slot}.json`, JSON.stringify(media), { contentType: "application/json", cacheControl: "0", upsert: true });
    if (publishError) throw publishError;
    return Response.json({ media });
  } catch {
    return Response.json({ error: "Could not publish. Your current published media has been kept; please retry." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApi();
    if ("response" in auth) return auth.response;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.slot !== "string" || !isMediaSlot(body.slot)) return Response.json({ error: "Invalid placement." }, { status: 400 });
    const { error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([`published/${body.slot}.json`]);
    if (error) throw error;
    return Response.json({ success: true });
  } catch { return Response.json({ error: "Could not unpublish. Please retry." }, { status: 503 }); }
}
