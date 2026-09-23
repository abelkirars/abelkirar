import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifiedIdentityFromUser, upsertVerifiedCustomer } from "@/lib/customer/dal";
import { courseAdmin, serializable } from "./admin-service";
import { assertRelationship, monthlyPeriod, PAYMENT_DEADLINE_RULE, preparationSchema, PreparationValidationError } from "./preparation-rules";
import { assertCohortSelectable } from "./cohorts";

/** Identity writes only. Financial creation and relationship persistence remain
 * one future transaction; this summary is not a reservation or durable draft. */
export async function prepareEnrollment(applicationId: string, raw: unknown) {
  const admin = await courseAdmin();
  const input = preparationSchema.parse(raw);
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(input.supabaseUserId);
  if (error || !data.user || data.user.id !== input.supabaseUserId) throw new PreparationValidationError("Verified account could not be resolved by Supabase ID");
  const identity = verifiedIdentityFromUser(data.user);

  return serializable(async tx => {
    await tx.$queryRaw`SELECT id FROM "CourseApplication" WHERE id = ${applicationId} FOR UPDATE`;
    const application = await tx.courseApplication.findUnique({ where: { id: applicationId }, include: { courseEnrollment: { select: { id: true } } } });
    if (!application || application.status !== "APPROVED" || application.courseEnrollment) throw new PreparationValidationError("An APPROVED, not-yet-enrolled application is required");
    const plan = await tx.coursePlan.findUnique({ where: { id: input.coursePlanId } });
    if (!plan || !plan.active || plan.archivedAt || plan.currency !== "USD" || plan.billingInterval !== "MONTHLY") throw new PreparationValidationError("Choose an active USD monthly course plan");
    if (application.requestedPlanId && application.requestedPlanId !== plan.id) throw new PreparationValidationError("Plan must match the approved application");
    let cohort = null;
    let start: string;
    let billingTimeZone: string;
    if (plan.format === "GROUP") {
      if (!input.cohortId || input.agreedStartDate || input.billingTimeZone) throw new PreparationValidationError("Group start and timezone must come from the selected cohort");
      cohort = await tx.courseCohort.findUnique({ where: { id: input.cohortId }, include: { seats: true, coursePlan: true } });
      if (!cohort) throw new PreparationValidationError("Cohort not found");
      assertCohortSelectable(cohort, plan.id);
      start = cohort.courseStartDate!.toISOString().slice(0, 10);
      billingTimeZone = cohort.timeZone!;
    } else {
      if (input.cohortId || !input.agreedStartDate || !input.billingTimeZone) throw new PreparationValidationError("1-to-1 requires an explicit start date, billing timezone, and no cohort");
      start = input.agreedStartDate;
      billingTimeZone = input.billingTimeZone;
    }

    const customer = await upsertVerifiedCustomer(identity, tx);
    if (customer.status !== "ACTIVE" || customer.archivedAt || customer.deactivatedAt) throw new PreparationValidationError("Customer is not active");
    if (application.customerId && application.customerId !== customer.id) throw new PreparationValidationError("Application already resolved to a different payer; review the audited link first");

    let learnerId = input.learner.mode === "EXISTING" ? input.learner.studentId : application.studentProfileId;
    if (application.studentProfileId && learnerId !== application.studentProfileId) throw new PreparationValidationError("Application already resolved to a different learner");
    if (learnerId) await tx.$queryRaw`SELECT id FROM "StudentProfile" WHERE id = ${learnerId} FOR UPDATE`;
    let learner = learnerId ? await tx.studentProfile.findUnique({ where: { id: learnerId } }) : null;
    if (learnerId && !learner) throw new PreparationValidationError("Learner not found");
    if (!learner) {
      if (input.learner.mode !== "NEW") throw new PreparationValidationError("Choose an existing learner or explicitly create one");
      if (input.relationship === "SELF" && await tx.studentProfile.findUnique({ where: { supabaseUserId: identity.supabaseUserId } })) throw new PreparationValidationError("This login already has a learner; explicitly select that learner's ID");
      learner = await tx.studentProfile.create({ data: {
        fullName: input.learner.fullName,
        supabaseUserId: input.relationship === "SELF" ? identity.supabaseUserId : null,
        email: input.relationship === "SELF" ? identity.email : null,
        locale: application.locale,
        portalAccess: false,
      } });
      learnerId = learner.id;
    } else if (input.learner.mode === "NEW" && learner.fullName !== input.learner.fullName) {
      throw new PreparationValidationError("The application already has a learner with different details; select the existing learner explicitly");
    }
    if (learner.archivedAt || learner.status !== "ACTIVE") throw new PreparationValidationError("Learner is not active");
    assertRelationship(input.relationship, identity.supabaseUserId, learner.supabaseUserId);
    const relations = await tx.customerStudentRelation.findMany({ where: { studentId: learner.id } });
    const existing = relations.find(r => r.customerId === customer.id);
    if (existing && (existing.type !== input.relationship || existing.endedAt || existing.archivedAt)) throw new PreparationValidationError("Existing relationship contradicts this choice or is inactive; review it first");
    if (input.relationship === "SELF" && relations.some(r => r.type === "SELF" && r.customerId !== customer.id && !r.endedAt && !r.archivedAt)) throw new PreparationValidationError("Learner already has another SELF relationship");

    if (application.customerId !== customer.id || application.studentProfileId !== learner.id) {
      await tx.courseApplication.update({ where: { id: applicationId }, data: { customerId: customer.id, studentProfileId: learner.id } });
      await tx.courseApplicationEvent.create({ data: { applicationId, fromStatus: "APPROVED", toStatus: "APPROVED", actorAdminId: admin.adminId,
        note: `Identity preparation: Customer ${customer.id}; learner ${learner.id}; explicit ${input.relationship}. Relationship persistence deferred. No enrollment/payment/access created.` } });
    }
    return {
      applicationId, learner: { id: learner.id, fullName: learner.fullName, hasLogin: Boolean(learner.supabaseUserId) },
      customer: { id: customer.id, email: identity.email, supabaseUserId: identity.supabaseUserId },
      relationship: input.relationship, relationshipState: existing ? "ACTIVE_EXISTING" : "DEFERRED_TO_FINAL_TRANSACTION",
      plan: { id: plan.id, code: plan.code, level: plan.level, format: plan.format, monthlyPriceCents: plan.monthlyPriceCents, currency: plan.currency },
      cohort: cohort ? { id: cohort.id, code: cohort.code, weeklyDay: cohort.weeklyDay, localStartTime: cohort.localStartTime!.toISOString().slice(11, 16), timeZone: cohort.timeZone, durationMinutes: cohort.durationMinutes } : null,
      billingTimeZone,
      ...monthlyPeriod(start), paymentDeadlineRule: PAYMENT_DEADLINE_RULE,
      warnings: ["NOT ENROLLED YET", "NO PAYMENT CREATED YET", "NO PORTAL ACCESS YET"],
    };
  });
}
export type PreparationSummary = Awaited<ReturnType<typeof prepareEnrollment>>;
