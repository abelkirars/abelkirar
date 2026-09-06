import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Exercise the product schema, not just the connection, to detect missing migrations.
    await prisma.product.findFirst();
    return Response.json({ status: "ok", catalog: "available" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", catalog: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
