import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdminApi } from "@/lib/admin/dal";
import { CoursePaymentReviewError, reviewCoursePayment } from "@/lib/courses/review-course-payment";
import { CoursePreparationError } from "@/lib/courses/admin-service";
import { PreparationValidationError } from "@/lib/courses/preparation-rules";
import { notifyCoursePaymentReviewed } from "@/lib/notifications/course-payment-reviewed";

export async function POST(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const result = await reviewCoursePayment((await params).paymentId, body);
    let emailSent: boolean | null = null;
    if (!result.idempotent) {
      try { emailSent = (await notifyCoursePaymentReviewed(result)).sent; }
      catch { emailSent = false; }
      if (!emailSent) console.warn("[course-payment-review] Notification not delivered", { paymentId: result.paymentId });
    }
    return NextResponse.json({ ok: true, status: result.status, idempotent: result.idempotent, emailSent });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid review" }, { status: 400 });
    if (error instanceof CoursePreparationError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof CoursePaymentReviewError || error instanceof PreparationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[course-payment-review] Transaction failed");
    return NextResponse.json({ error: "Review could not be completed. Reload to check the current state." }, { status: 500 });
  }
}
