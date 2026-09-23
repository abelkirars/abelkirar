import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  CoursePaymentCustomerDeniedError,
  requireActiveCourseCustomer,
} from "@/lib/courses/course-payment-access";
import { isConfiguredCoursePaymentMethod } from "@/lib/courses/course-payment-instructions";
import {
  InvalidCoursePaymentProofFieldsError,
  parseCoursePaymentProofFields,
} from "@/lib/courses/course-payment-proof-input";
import {
  InvalidCoursePaymentProofError,
  validateCoursePaymentProof,
} from "@/lib/courses/course-payment-proofs";
import {
  CoursePaymentSubmissionError,
  submitCoursePaymentProofForCustomer,
} from "@/lib/courses/submit-course-payment-proof";
import {
  CustomerAuthenticationError,
  CustomerEmailNotVerifiedError,
} from "@/lib/customer/dal";

export const runtime = "nodejs";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  let customer;
  try {
    customer = await requireActiveCourseCustomer();
  } catch (error) {
    if (error instanceof CustomerAuthenticationError || error instanceof CustomerEmailNotVerifiedError) {
      return NextResponse.json({ error: "Authentication with a verified email is required" }, { status: 401 });
    }
    if (error instanceof CoursePaymentCustomerDeniedError) {
      return NextResponse.json({ error: "Active customer account required" }, { status: 403 });
    }
    throw error;
  }

  const { paymentId } = await params;
  const allowed = await checkRateLimit(`course-payment-proof:${customer.id}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission" }, { status: 400 });
  }

  try {
    const fields = parseCoursePaymentProofFields(formData);
    if (!isConfiguredCoursePaymentMethod(fields.method)) {
      return NextResponse.json({ error: "That payment method is not currently available" }, { status: 400 });
    }
    const file = formData.get("proof");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a payment proof file" }, { status: 400 });
    }
    const proof = await validateCoursePaymentProof(file);
    const result = await submitCoursePaymentProofForCustomer(customer.id, paymentId, fields, proof);

    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      submission: result.submission,
      message: "Payment proof received. It is awaiting verification; payment and course access are not yet confirmed.",
    });
  } catch (error) {
    if (error instanceof InvalidCoursePaymentProofFieldsError || error instanceof InvalidCoursePaymentProofError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CoursePaymentSubmissionError) {
      const status = error.problem === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error(`[course-payment-proof] Submission failed for payment ${paymentId}`);
    return NextResponse.json({ error: "Unable to save payment proof" }, { status: 500 });
  }
}
