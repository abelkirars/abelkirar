export const DEFAULT_ACCOUNT_PATH = "/account";

/** Only permit local account destinations; never turn a login redirect into an open redirect. */
export function safeAccountNextPath(value: string | null | undefined): string {
  if (!value || /[\\\r\n]/.test(value)) {
    return DEFAULT_ACCOUNT_PATH;
  }
  let target: URL;
  try { target = new URL(value, "https://account.invalid"); }
  catch { return DEFAULT_ACCOUNT_PATH; }
  if (target.origin !== "https://account.invalid" ||
      !(target.pathname === "/account" || target.pathname.startsWith("/account/")) ||
      ["/account/login", "/account/signup", "/account/confirm"].includes(target.pathname) || /%2f|%5c|%2e/i.test(target.pathname)) return DEFAULT_ACCOUNT_PATH;
  return `${target.pathname}${target.search}${target.hash}`;
}
