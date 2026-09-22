import "server-only";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { PreparationValidationError } from "./preparation-rules";
import { CoursePreparationError } from "./admin-service";
import { CustomerEmailNotVerifiedError } from "@/lib/customer/dal";

export function preparationErrorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => i.message).join("; ") }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json({ error: "Database conflict or unavailable. Refresh and retry; no partial preparation was saved." }, { status: 409 });
  }
  if (error instanceof PreparationValidationError || error instanceof CoursePreparationError || error instanceof CustomerEmailNotVerifiedError) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: "Unable to complete preparation. Refresh and check the inputs before retrying." }, { status: 400 });
}
