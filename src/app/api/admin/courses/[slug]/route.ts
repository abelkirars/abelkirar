import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminApi } from "@/lib/admin/dal";
import { prisma } from "@/lib/db";
import { COURSE_LEVELS } from "@/lib/courses-data";
import { coursePriceSchema } from "@/lib/validations/course-price";
import { getCoursePricing } from "@/lib/course-pricing";

type Context = { params: Promise<{ slug: string }> };

async function handle(request: Request, context: Context, save: boolean) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  const { slug } = await context.params;
  if (!COURSE_LEVELS.some((course) => course.slug === slug)) {
    return NextResponse.json({ error: "unknownCourse" }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const parsed = coursePriceSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json({ error: field === "priceCents" ? "invalidPrice" : "invalidDiscount", field }, { status: 400 });
  }
  try {
    const pricing = await getCoursePricing(slug, parsed.data);
    if (save) {
      await prisma.coursePrice.upsert({ where: { slug }, create: { slug, ...parsed.data }, update: parsed.data });
      revalidatePath("/courses");
      revalidatePath(`/courses/${slug}`);
      revalidatePath("/admin/courses");
    }
    return NextResponse.json({ pricing }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "saveFailed" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: Context) {
  return handle(request, context, true);
}

// Read-only draft preview; the same guard and validation apply as to a save.
export async function POST(request: Request, context: Context) {
  return handle(request, context, false);
}
