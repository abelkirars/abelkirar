/**
 * Pure helpers shared by the copy-override merge layer (server), the admin
 * editor (client) and the write API. Deliberately free of `server-only`,
 * Prisma and next-intl imports so the editor can reuse exactly the same
 * flattening and placeholder rules the server validates against — two
 * implementations of "what counts as a valid override" would drift.
 */

/** A leaf string in a messages file, addressed by its dot path. */
export type FlatMessages = Record<string, string>;

type MessageNode = { [key: string]: MessageNode | string };

/**
 * Turns a nested messages object into `{ "about.paragraph1": "I began…" }`.
 *
 * Only leaf strings are emitted. The messages files contain no arrays or
 * numbers today, and this intentionally skips anything that is neither an
 * object nor a string rather than coercing it: an override is a *string*
 * replacement, and a key whose default is not a string has no safe editor.
 */
export function flattenMessages(messages: unknown, prefix = ""): FlatMessages {
  const flat: FlatMessages = {};
  if (!isRecord(messages)) return flat;

  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      flat[path] = value;
    } else if (isRecord(value)) {
      Object.assign(flat, flattenMessages(value, path));
    }
  }

  return flat;
}

/**
 * Returns a copy of `messages` with each override applied at its dot path.
 *
 * An override is applied ONLY where the path already resolves to a leaf
 * string in the defaults. A key that no longer exists — renamed in a later
 * release, or typed by hand — is silently skipped rather than inserted, so a
 * stale row can never introduce a key the code does not read, and can never
 * replace an object node and break `t()` for a whole namespace. That is the
 * property that makes it safe to leave old rows in the table after a rename.
 *
 * The input is not mutated: the imported JSON module object is shared across
 * every request in a warm serverless instance, so mutating it would leak one
 * visitor's locale into another's.
 */
export function applyOverrides(messages: unknown, overrides: FlatMessages): Record<string, unknown> {
  if (!isRecord(messages)) return {};
  // Clone even without overrides: callers must never receive a mutable
  // reference to the JSON module cache (including its nested objects).
  const result = structuredClone(messages) as MessageNode;

  for (const [path, value] of Object.entries(overrides)) {
    const segments = path.split(".");
    const leaf = segments.pop();
    if (!leaf) continue;

    let node: MessageNode = result;
    let reachable = true;
    for (const segment of segments) {
      const next = node[segment];
      if (!isRecord(next)) {
        reachable = false;
        break;
      }
      node = next as MessageNode;
    }

    if (reachable && typeof node[leaf] === "string") {
      node[leaf] = value;
    }
  }

  return result;
}

/**
 * The ICU argument names a message depends on, e.g. `["orderNumber", "total"]`.
 *
 * Matches both the simple form (`{total}`) and the opening of an argument with
 * a type (`{count, plural, …}`), which is why the terminator is `[,}]`. Sorted
 * and de-duplicated so two placeholder sets can be compared directly.
 */
export function messagePlaceholders(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

/**
 * Guards the one edit that can take a page down: dropping or misspelling a
 * placeholder. `{orderNumber}` missing from an order email is not a typo
 * next-intl renders around — it throws, and the render fails. Extra names are
 * rejected for the same reason: next-intl throws on an argument the caller
 * never passes. Returns null when the edit is safe.
 */
export function placeholderDrift(
  defaultMessage: string,
  nextMessage: string
): { missing: string[]; unexpected: string[] } | null {
  const expected = messagePlaceholders(defaultMessage);
  const actual = messagePlaceholders(nextMessage);
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  return missing.length || unexpected.length ? { missing, unexpected } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
