const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const usdWithCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUsd(cents: number): string {
  return (cents % 100 === 0 ? usd : usdWithCents).format(cents / 100);
}

export function formatPriceAdjustment(cents: number): string {
  return `${cents > 0 ? "+" : ""}${formatUsd(cents)}`;
}
