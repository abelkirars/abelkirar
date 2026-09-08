import { expect, it, describe, vi, beforeEach, afterEach } from "vitest";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { product: { findFirst } } }));
import { GET } from "./route";

const ENV_KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "ADMIN_NOTIFICATION_EMAILS"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  findFirst.mockReset();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

it("reports an empty but reachable catalog as healthy and schema/connection errors as 503", async () => {
  findFirst.mockResolvedValue(null);
  expect((await GET()).status).toBe(200);
  findFirst.mockRejectedValue(new Error("database credentials"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).not.toContain("credentials");
});

describe("notification configuration", () => {
  it("reports presence as booleans and recipients as a count", async () => {
    findFirst.mockResolvedValue(null);
    process.env.RESEND_API_KEY = "re_a_real_looking_key";
    process.env.RESEND_FROM_EMAIL = "hello@abelkirar.com";
    process.env.ADMIN_NOTIFICATION_EMAILS = "one@abelkirar.com,two@abelkirar.com";

    const body = await (await GET()).json();

    expect(body.notifications).toEqual({
      resendApiKey: true,
      resendFromEmail: true,
      adminRecipients: 2,
    });
  });

  it("never leaks a value — not the key, not the from address, not a recipient", async () => {
    findFirst.mockResolvedValue(null);
    process.env.RESEND_API_KEY = "re_secret_value_must_not_appear";
    process.env.RESEND_FROM_EMAIL = "from-address@abelkirar.com";
    process.env.ADMIN_NOTIFICATION_EMAILS = "recipient@abelkirar.com";

    const text = await (await GET()).text();

    expect(text).not.toContain("re_secret_value_must_not_appear");
    expect(text).not.toContain("from-address@abelkirar.com");
    expect(text).not.toContain("recipient@abelkirar.com");
    expect(text).not.toContain("abelkirar.com");
  });

  it("reports false and zero when nothing is configured — the bug this exists to catch", async () => {
    findFirst.mockResolvedValue(null);
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.ADMIN_NOTIFICATION_EMAILS;

    const body = await (await GET()).json();

    expect(body.notifications).toEqual({
      resendApiKey: false,
      resendFromEmail: false,
      adminRecipients: 0,
    });
  });

  it("treats an empty string as absent", async () => {
    findFirst.mockResolvedValue(null);
    process.env.RESEND_API_KEY = "";
    process.env.RESEND_FROM_EMAIL = "";

    const body = await (await GET()).json();

    expect(body.notifications.resendApiKey).toBe(false);
    expect(body.notifications.resendFromEmail).toBe(false);
  });

  it("still reports notification configuration when the database is unreachable", async () => {
    findFirst.mockRejectedValue(new Error("connection refused"));
    process.env.RESEND_API_KEY = "re_key";
    process.env.RESEND_FROM_EMAIL = "hello@abelkirar.com";
    process.env.ADMIN_NOTIFICATION_EMAILS = "one@abelkirar.com";

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.notifications.resendApiKey).toBe(true);
    expect(body.notifications.adminRecipients).toBe(1);
  });

  it("does not let missing mail configuration change the status — that reflects the database only", async () => {
    findFirst.mockResolvedValue(null);
    delete process.env.RESEND_API_KEY;

    const response = await GET();

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("ok");
  });
});
