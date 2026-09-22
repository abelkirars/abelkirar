/** Format the original instant in UTC, including an explicit timezone label. */
export function formatPaymentDeadline(locale: string, value: Date): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}
