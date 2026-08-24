type PracticeSummaryEntry = {
  practicedAt: Date;
  durationMinutes: number;
};

export type PracticeSummary = {
  sessionsThisWeek: number;
  minutesThisWeek: number;
  latestPracticeAt: Date | null;
};

function startOfUtcWeek(now: Date) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const daysSinceMonday = start.getUTCDay() === 0 ? 6 : start.getUTCDay() - 1;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

export function getPracticeSummary(
  entries: readonly PracticeSummaryEntry[],
  now = new Date(),
): PracticeSummary {
  const weekStart = startOfUtcWeek(now);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

  let sessionsThisWeek = 0;
  let minutesThisWeek = 0;
  let latestPracticeAt: Date | null = null;

  for (const entry of entries) {
    if (entry.practicedAt >= weekStart && entry.practicedAt < nextWeekStart) {
      sessionsThisWeek += 1;
      minutesThisWeek += entry.durationMinutes;
    }

    if (latestPracticeAt === null || entry.practicedAt > latestPracticeAt) {
      latestPracticeAt = entry.practicedAt;
    }
  }

  return { sessionsThisWeek, minutesThisWeek, latestPracticeAt };
}
