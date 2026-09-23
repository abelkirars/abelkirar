import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/dal";
import { cancelPromotion, createPromotion, PromotionConflictError } from "@/lib/courses/promotions";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const body = await request.json();
    if (body.action === "cancel" && typeof body.id === "string") await cancelPromotion(body.id);
    else if (body.action === "create") await createPromotion(body.promotion);
    else return NextResponse.json({ error: "invalid" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PromotionConflictError ? "overlap" : "invalid" }, { status: error instanceof PromotionConflictError ? 409 : 400 });
  }
}
