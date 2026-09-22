export const DEFAULT_ACCOUNT_PATH = "/courses";

/** Only permit local account destinations; never turn a login redirect into an open redirect. */
export function safeAccountNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/account/") || value.startsWith("//")) {
    return DEFAULT_ACCOUNT_PATH;
  }
  return value;
}
