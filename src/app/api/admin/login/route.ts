import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/admin/password";
import { createAdminSession } from "@/lib/admin/session";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const ip = clientIpFrom(request);
  const allowed = await checkRateLimit(`admin-login:${ip}`, {
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429 }
    );
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const admin = await prisma.admin.findUnique({
    where: { username: parsed.data.username },
  });

  // Always run a bcrypt compare, even on a missing user, so responses take a
  // consistent amount of time regardless of whether the username exists.
  const passwordHash = admin?.passwordHash ?? "$2b$12$invalidsaltinvalidsaltinvalidsaltinvalidsal";
  const validPassword = await verifyPassword(parsed.data.password, passwordHash);

  if (!admin || !admin.isActive || !validPassword) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  await createAdminSession({
    adminId: admin.id,
    username: admin.username,
    displayName: admin.displayName,
  });

  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
