import twilio from "twilio";

type TwilioClient = ReturnType<typeof twilio>;

const REQUEST_TIMEOUT_MS = 10_000;

let cachedClient: TwilioClient | null = null;
let testOverrideClient: TwilioClient | null = null;

/**
 * Master switch — when unset/false, no Twilio API request is made at all,
 * regardless of whether credentials are configured.
 */
export function isTwilioNotificationsEnabled(): boolean {
  return process.env.TWILIO_NOTIFICATIONS_ENABLED === "true";
}

export function getTwilioClient(): TwilioClient | null {
  if (testOverrideClient) return testOverrideClient;
  if (cachedClient) return cachedClient;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !authToken) return null;

  cachedClient = twilio(sid, authToken, { timeout: REQUEST_TIMEOUT_MS });
  return cachedClient;
}

/**
 * Test-only seam for injecting a mocked client so tests never hit the real
 * Twilio API. Never called from any production code path — only from
 * one-off verification scripts. Pass null to clear the override.
 */
export function __setTwilioClientForTesting(client: TwilioClient | null): void {
  testOverrideClient = client;
}
