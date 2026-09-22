import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/dal";
import {
  ApplicationDecisionConflictError,
  CourseApplicationNotFoundError,
  InvalidApplicationTransitionError,
  InvalidCoursePlanError,
  decideCourseApplication,
} from "@/lib/course-application-review";
import { notifyApplicantOfCourseApplicationDecision } from "@/lib/notifications/course-application-decision";
import { defaultLocale, isLocale } from "@/i18n/locale";

const decisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "WAITLIST", "DECLINE"]),
    coursePlanId: z.string().trim().min(1).max(100).optional(),
    decisionReason: z.string().trim().max(2000).optional(),
    adminNotes: z.string().trim().max(5000).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === "DECLINE" && !value.decisionReason) {
      context.addIssue({
        code: "custom",
        path: ["decisionReason"],
        message: "A decline reason is required",
      });
    }
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid decision" },
      { status: 400 }
    );
  }

  const { id } = await params;
  try {
    const decision = await decideCourseApplication({
      applicationId: id,
      adminId: auth.session.adminId,
      ...parsed.data,
    });

    let notification;
    try {
      notification = await notifyApplicantOfCourseApplicationDecision({
        applicationId: decision.applicationId,
        fullName: decision.fullName,
        email: decision.email,
        locale: isLocale(decision.locale) ? decision.locale : defaultLocale,
        isUnder15: decision.isUnder15,
        guardianName: decision.guardianName,
        status: decision.status,
        decisionReason: decision.decisionReason,
      });
    } catch {
      notification = { sent: false, error: "Decision email could not be sent" };
    }

    if (!notification.sent) {
      console.error(
        `[course-applications] Decision email NOT sent for application ${decision.applicationId}`
      );
    }

    return NextResponse.json({ ok: true, status: decision.status, notification });
  } catch (error) {
    if (error instanceof CourseApplicationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidCoursePlanError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof InvalidApplicationTransitionError ||
      error instanceof ApplicationDecisionConflictError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
