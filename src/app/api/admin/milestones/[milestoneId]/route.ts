import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { milestoneSchema } from "@/lib/validations/milestone";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ milestoneId: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { milestoneId } = await params;

  const existing = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!existing) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const parsed = milestoneSchema.safeParse({
    level: formData.get("level"),
    label: formData.get("label"),
    description: formData.get("description") || undefined,
    internalCriteria: formData.get("internalCriteria") || undefined,
    sortOrder: formData.get("sortOrder"),
    active: formData.get("active"),
    effectiveFrom: formData.get("effectiveFrom") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { level, label, description, internalCriteria, sortOrder, active, effectiveFrom } =
    parsed.data;

  const milestone = await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      level,
      label,
      description: description || null,
      internalCriteria: internalCriteria || null,
      sortOrder,
      active,
      ...(effectiveFrom ? { effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`) } : {}),
    },
  });

  return NextResponse.json({ ok: true, milestone });
}
