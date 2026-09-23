import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export function schedulerAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || secret.trim() !== secret) return false;
  const header = request.headers.get("authorization");
  if (!header || header.length > 1024) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
