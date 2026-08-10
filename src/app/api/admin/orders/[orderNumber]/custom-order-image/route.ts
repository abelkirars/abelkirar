import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { getCustomOrderImageSignedUrl } from "@/lib/custom-order-images";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { orderNumber } = await params;

  const order = await prisma.order.findUnique({ where: { orderNumber } });

  if (!order || !order.customOrderImagePath) {
    return NextResponse.json({ error: "Reference image not found" }, { status: 404 });
  }

  const url = await getCustomOrderImageSignedUrl(order.customOrderImagePath);
  if (!url) {
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
  }

  return NextResponse.redirect(url);
}
