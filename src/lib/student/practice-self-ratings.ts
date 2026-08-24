export const PRACTICE_SELF_RATING_OPTIONS = [
  { value: "Focused", messageKey: "practiceSelfRatings.focused" },
  { value: "Rushed", messageKey: "practiceSelfRatings.rushed" },
  { value: "Distracted", messageKey: "practiceSelfRatings.distracted" },
  { value: "Difficult", messageKey: "practiceSelfRatings.difficult" },
  { value: "Enjoyable", messageKey: "practiceSelfRatings.enjoyable" },
  { value: "Frustrating", messageKey: "practiceSelfRatings.frustrating" },
  { value: "Steady", messageKey: "practiceSelfRatings.steady" },
  { value: "Breakthrough", messageKey: "practiceSelfRatings.breakthrough" },
] as const;

export type PracticeSelfRatingMessageKey =
  (typeof PRACTICE_SELF_RATING_OPTIONS)[number]["messageKey"];

export function getPracticeSelfRatingMessageKey(
  value: string | null | undefined,
): PracticeSelfRatingMessageKey | null {
  return (
    PRACTICE_SELF_RATING_OPTIONS.find((option) => option.value === value)?.messageKey ?? null
  );
}

export function normalizePracticeSelfRating(
  value: string | undefined,
  getMessage: (key: PracticeSelfRatingMessageKey) => string,
): string | undefined {
  return (
    PRACTICE_SELF_RATING_OPTIONS.find((option) => getMessage(option.messageKey) === value)?.value ??
    value
  );
}
