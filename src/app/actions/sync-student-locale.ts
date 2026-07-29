"use server";

import { cookies } from "next/headers";
import { resolveStudentSession } from "@/lib/student/dal";
import { isLocale, localeCookieName } from "@/i18n/locale";
import { setLocale } from "@/app/actions/set-locale";

/**
 * Called right after a successful student sign-in, before redirecting to the
 * dashboard, so the portal appears in the student's own language without
 * them having to find the switcher first.
 *
 * Deliberately only acts when this browser has no NEXT_LOCALE cookie yet
 * (first login on a device/browser, or the cookie was cleared) — a student
 * who has ever manually switched language, including via this same
 * mechanism on a previous login, keeps that choice on every later login
 * instead of being silently reset to StudentProfile.locale every time. This
 * was the risk with unconditionally syncing on every login: any student who
 * deliberately prefers a UI language different from their stored profile
 * locale would have that preference overwritten on their very next login.
 */
export async function syncStudentLocaleOnFirstLogin(): Promise<void> {
  const cookieStore = await cookies();
  if (cookieStore.get(localeCookieName)) return;

  const result = await resolveStudentSession();
  if (result.kind !== "active") return;
  if (!isLocale(result.session.locale)) return;

  await setLocale(result.session.locale);
}
