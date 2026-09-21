import "server-only";

/**
 * Server-internal handoff contracts for Phase 2B. They deliberately contain
 * identifiers and decisions only: prices must be loaded and calculated on
 * the server from CoursePlan/Promotion when an obligation is created.
 */
export type ApplicationDecision = "APPROVE" | "WAITLIST" | "DECLINE";

export interface ApplicationDecisionRequest {
  applicationId: string;
  decision: ApplicationDecision;
  reviewedByAdminId: string;
  publicReason?: string;
  privateNotes?: string;
}

export interface ApprovedEnrollmentContext {
  applicationId: string;
  customerId: string;
  studentId: string;
  coursePlanId: string;
  cohortId?: string;
}

export interface InitialPaymentPreparation {
  enrollmentId: string;
  coursePlanId: string;
  promotionId?: string;
  obligationCreatedAt: Date;
}

export const INITIAL_PAYMENT_WINDOW_CALENDAR_DAYS = 7;
