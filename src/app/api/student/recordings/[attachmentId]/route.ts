import { NextResponse } from "next/server";
import { requireStudentApi } from "@/lib/student/dal";
import { getMyRecordingAttachment } from "@/lib/student/queries";
import { getRecordingSignedUrl } from "@/lib/student-recordings";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const auth = await requireStudentApi();
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const { attachmentId } = await params;
  const attachment = await getMyRecordingAttachment(session, attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const url = await getRecordingSignedUrl(attachment.storagePath);
  if (!url) {
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
  }

  return NextResponse.redirect(url);
}
