import "server-only";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

/** Codes are translated by the editor. Raw database messages never cross this boundary. */
export function lessonScheduleErrorResponse(error: unknown) {
  let code = "unavailable", status = 500;
  if (error instanceof ZodError || error instanceof SyntaxError) { code = "invalid"; status = 400; }
  if (error instanceof Error) {
    const known: Record<string, string> = {
      "Admin authentication required": "unauthorized",
      "Explicit active teacher required": "teacher",
      "Schedule teacher not found": "teacher",
      "Invalid group schedule owner": "owner",
      "Invalid private schedule owner": "owner",
      "Published schedules cannot be edited in this phase": "published",
      "Configure both drafts explicitly before publication": "incomplete",
      "Both lessons require the same teacher": "teacher",
      "Teacher recurring lesson conflict": "conflict",
    };
    if (known[error.message]) { code = known[error.message]; status = code === "unauthorized" ? 401 : 409; }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P2034", "P2002"].includes(error.code)) { code = "retry"; status = 409; }
    // DB guards are a final safety net, including concurrent lifecycle changes.
    if (["P2004", "P2010"].includes(error.code)) { code = "retry"; status = 409; }
  }
  return NextResponse.json({ error: code }, { status });
}
