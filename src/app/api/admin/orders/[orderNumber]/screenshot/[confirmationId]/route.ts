import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { getPaymentScreenshotSignedUrl } from "@/lib/payment-screenshots";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string; confirmationId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { orderNumber, confirmationId } = await params;

  const confirmation = await prisma.paymentConfirmation.findUnique({
    where: { id: confirmationId },
    include: { order: true },
  });

  if (
    !confirmation ||
    !confirmation.screenshotPath ||
    confirmation.order.orderNumber !== orderNumber
  ) {
    return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
  }

  const url = await getPaymentScreenshotSignedUrl(confirmation.screenshotPath);
  if (!url) {
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
  }

  return NextResponse.redirect(url);
}
