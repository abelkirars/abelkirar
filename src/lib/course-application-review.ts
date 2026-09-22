import "server-only";

import type { CourseApplicationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { COURSE_PLAN_CODES } from "@/lib/courses/plans";

export type CourseApplicationDecision = "APPROVE" | "WAITLIST" | "DECLINE";
type DecidedApplicationStatus = Exclude<CourseApplicationStatus, "PENDING">;

export interface DecideCourseApplicationInput {
  applicationId: string;
  decision: CourseApplicationDecision;
  adminId: string;
  coursePlanId?: string;
  decisionReason?: string;
  adminNotes?: string;
}

export class CourseApplicationNotFoundError extends Error {}
export class InvalidApplicationTransitionError extends Error {}
export class InvalidCoursePlanError extends Error {}
export class ApplicationDecisionConflictError extends Error {}

const allowedFromStatuses: Record<CourseApplicationDecision, CourseApplicationStatus[]> = {
  APPROVE: ["PENDING", "WAITLISTED"],
  WAITLIST: ["PENDING"],
  DECLINE: ["PENDING", "WAITLISTED"],
};

const targetStatus: Record<CourseApplicationDecision, DecidedApplicationStatus> = {
  APPROVE: "APPROVED",
  WAITLIST: "WAITLISTED",
  DECLINE: "DECLINED",
};

export async function listCourseApplications(status?: CourseApplicationStatus) {
  return prisma.courseApplication.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      fullName: true,
      email: true,
      createdAt: true,
      requestedLevel: true,
      status: true,
      reviewedAt: true,
      requestedPlan: {
        select: {
          code: true,
          level: true,
          format: true,
        },
      },
    },
  });
}

export async function getCourseApplicationReview(id: string) {
  return prisma.courseApplication.findUnique({
    where: { id },
    include: {
      requestedPlan: true,
      reviewedBy: { select: { displayName: true } },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actorAdmin: { select: { displayName: true } } },
      },
    },
  });
}

function auditNote(
  adminNotes: string | undefined,
  decisionReason: string | undefined,
  plan: { id: string; code: string } | null
) {
  const parts = [
    decisionReason?.trim() ? `Applicant-visible reason: ${decisionReason.trim()}` : null,
    adminNotes?.trim() ? `Private admin note: ${adminNotes.trim()}` : null,
  ];
  if (plan) parts.push(`Course plan selected: ${plan.code} (${plan.id})`);
  return parts.filter(Boolean).join("\n") || null;
}

/**
 * Applies one decision atomically. The status predicate on updateMany is the
 * concurrency guard: only the first request can move the row from the status
 * it read, and the event is committed in that same transaction.
 */
export async function decideCourseApplication(input: DecideCourseApplicationInput) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.courseApplication.findUnique({
      where: { id: input.applicationId },
      select: {
        id: true,
        fullName: true,
        email: true,
        locale: true,
        isUnder15: true,
        guardianName: true,
        status: true,
        requestedLevel: true,
        requestedPlanId: true,
        requestedPlan: { select: { level: true, format: true } },
      },
    });

    if (!application) throw new CourseApplicationNotFoundError("Application not found");
    if (!allowedFromStatuses[input.decision].includes(application.status)) {
      throw new InvalidApplicationTransitionError(
        `Cannot ${input.decision.toLowerCase()} an application in ${application.status} status`
      );
    }

    if (input.decision === "DECLINE" && !input.decisionReason?.trim()) {
      throw new InvalidApplicationTransitionError("A decline reason is required");
    }

    let selectedPlan: { id: string; code: string } | null = null;
    if (input.decision === "APPROVE") {
      const planId = input.coursePlanId ?? application.requestedPlanId;
      if (!planId) {
        throw new InvalidCoursePlanError("Select an active course plan before approval");
      }

      const plan = await tx.coursePlan.findFirst({
        where: {
          id: planId,
          code: { in: [...COURSE_PLAN_CODES] },
          active: true,
          archivedAt: null,
        },
        select: { id: true, code: true, level: true, format: true },
      });
      if (!plan) throw new InvalidCoursePlanError("The selected course plan is unavailable");

      if (application.requestedLevel && application.requestedLevel !== plan.level) {
        throw new InvalidCoursePlanError("The selected plan does not match the requested level");
      }
      if (application.requestedPlan && application.requestedPlan.format !== plan.format) {
        throw new InvalidCoursePlanError("The selected plan does not match the requested format");
      }
      selectedPlan = { id: plan.id, code: plan.code };
    }

    const now = new Date();
    const nextStatus = targetStatus[input.decision];
    const updateData: Prisma.CourseApplicationUncheckedUpdateManyInput = {
      status: nextStatus,
      reviewedAt: now,
      reviewedById: input.adminId,
      decisionReason: input.decisionReason?.trim() || null,
      adminNotes: input.adminNotes?.trim() || null,
      ...(selectedPlan ? { requestedPlanId: selectedPlan.id } : {}),
    };

    const updated = await tx.courseApplication.updateMany({
      where: { id: application.id, status: application.status },
      data: updateData,
    });
    if (updated.count !== 1) {
      throw new ApplicationDecisionConflictError(
        "This application was changed by another request. Refresh and review its current state."
      );
    }

    await tx.courseApplicationEvent.create({
      data: {
        applicationId: application.id,
        fromStatus: application.status,
        toStatus: nextStatus,
        actorAdminId: input.adminId,
        note: auditNote(input.adminNotes, input.decisionReason, selectedPlan),
      },
    });

    return {
      applicationId: application.id,
      fullName: application.fullName,
      email: application.email,
      locale: application.locale,
      isUnder15: application.isUnder15,
      guardianName: application.guardianName,
      status: nextStatus,
      decisionReason: input.decisionReason?.trim() || null,
      coursePlanCode: selectedPlan?.code ?? null,
    };
  });
}
