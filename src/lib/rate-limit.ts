import { prisma } from "@/lib/db";

/**
 * Simple DB-backed sliding-window rate limiter. There's no Redis/Upstash in
 * this project, and in-memory counters don't survive across serverless
 * function instances, so hits are recorded as rows and counted per window.
 *
 * Returns true if the request is allowed, false if the limit was exceeded.
 */
export async function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs);

  const [count] = await prisma.$transaction([
    prisma.rateLimitHit.count({
      where: { key, createdAt: { gte: windowStart } },
    }),
  ]);

  if (count >= limit) {
    return false;
  }

  await prisma.rateLimitHit.create({ data: { key } });

  // Opportunistic cleanup so the table doesn't grow unbounded — best effort,
  // failures here shouldn't block the request.
  prisma.rateLimitHit
    .deleteMany({ where: { key, createdAt: { lt: windowStart } } })
    .catch(() => undefined);

  return true;
}

export function clientIpFrom(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
