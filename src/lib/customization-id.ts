/**
 * Field/choice id generation for the customization-options admin editor.
 * Ids are frozen once assigned from a label and never regenerated — they
 * are the join key for computeUnitPrice, selectedCustomization, and the
 * future order-time snapshot, so churn here is a correctness risk for no
 * UI benefit (the id itself is never customer-visible).
 */

export function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "item"; // label slugifies to nothing (all punctuation/non-latin)
}

/** Appends -2, -3, ... until the slug doesn't collide with a sibling id. */
export function uniqueId(label: string, existingIds: string[]): string {
  const base = slugify(label);
  if (!existingIds.includes(base)) return base;
  let suffix = 2;
  while (existingIds.includes(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

/**
 * If `currentId` is already set, returns it unchanged — ids are frozen once
 * assigned and never recomputed from later label edits. Otherwise, if
 * `label` is non-empty, computes a fresh id from it. Returns "" (still
 * unset) if both are empty.
 */
export function freezeId(currentId: string, label: string, existingIds: string[]): string {
  if (currentId) return currentId;
  const trimmed = label.trim();
  if (!trimmed) return "";
  return uniqueId(trimmed, existingIds);
}

/**
 * React-key-only identifier for editor-local list items — never sent to the
 * server, never security-sensitive. crypto.randomUUID() needs a secure
 * context (HTTPS or localhost); production admin and normal local dev both
 * qualify, but this falls back instead of throwing on a path that doesn't
 * (e.g. the dev server reached via a LAN IP).
 */
export function randomKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
