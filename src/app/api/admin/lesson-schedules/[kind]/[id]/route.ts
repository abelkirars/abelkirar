import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/dal";
import { lessonDraftSchema, lessonOwnerSchema } from "@/lib/courses/lesson-schedule-rules";
import { saveLessonScheduleDraft, publishLessonSchedule, archiveLessonSchedule } from "@/lib/courses/lesson-schedules";
import { lessonScheduleErrorResponse } from "@/lib/courses/lesson-schedule-response";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draft"), draft: lessonDraftSchema }).strict(),
  z.object({ action: z.literal("publish") }).strict(),
  z.object({ action: z.literal("archive"), confirmed: z.literal(true) }).strict(),
]);

export async function POST(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "invalid" }, { status: 415 });
  try {
    const owner = lessonOwnerSchema.parse(await params);
    const body = command.parse(await request.json());
    if (body.action === "draft") await saveLessonScheduleDraft(owner, body.draft);
    else if (body.action === "publish") await publishLessonSchedule(owner);
    else await archiveLessonSchedule(owner);
    return NextResponse.json({ ok: true });
  } catch (error) { return lessonScheduleErrorResponse(error); }
}
