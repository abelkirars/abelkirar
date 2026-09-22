import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/dal";
import { preparationErrorResponse } from "@/lib/courses/admin-response";
import { createEnrollmentAndInitialPayment } from "@/lib/courses/create-enrollment";
import { notifyCoursePaymentRequired } from "@/lib/notifications/course-payment-notifications";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  try {
    const result = await createEnrollmentAndInitialPayment((await params).id, await request.json());
    if (!result.idempotent) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
      if (siteUrl) {
        try {
          const securePaymentUrl = new URL(`/account/course-payments/${result.payment.id}`, siteUrl).toString();
          const email = await notifyCoursePaymentRequired({
            customerEmail: result.customer.email,
            locale: result.customer.locale,
            learnerName: result.learner.fullName,
            courseCode: result.course.code,
            amountCents: result.payment.finalAmountCents,
            currency: result.payment.currency,
            deadline: new Date(result.payment.expiresAt),
            securePaymentUrl,
          });
          if (!email.sent) {
            console.error(`[course-enrollment] Payment-required email not sent for payment ${result.payment.id}:`, email.error);
          }
        } catch (error) {
          console.error(`[course-enrollment] Payment-required email failed for payment ${result.payment.id}:`, error);
        }
      } else {
        console.error(`[course-enrollment] Payment-required email skipped for payment ${result.payment.id}: NEXT_PUBLIC_SITE_URL is not configured`);
      }
    }
    return NextResponse.json({ result });
  } catch (error) {
    return preparationErrorResponse(error);
  }
}
