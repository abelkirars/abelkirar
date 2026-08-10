import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.fn();
vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: (...args: unknown[]) => mockSend(...args) } },
}));

import { sendEmail, adminEmailRecipients } from "@/lib/notifications/email";

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "ADMIN_NOTIFICATION_EMAILS"] as const;

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "hello@abelkirar.com";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("sendEmail", () => {
  it("returns { sent: true } when Resend resolves without an error", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_123" }, error: null });

    const result = await sendEmail({ to: "student@example.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result).toEqual({ sent: true });
  });

  it("returns sent:false with the real message when Resend resolves with an API-level error (never throws)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSend.mockResolvedValue({
      data: null,
      error: {
        statusCode: 403,
        message: "The abelkirar.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
        name: "validation_error",
      },
    });

    const result = await sendEmail({ to: "student@example.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result.sent).toBe(false);
    expect(result.error).toContain("not verified");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns sent:false and never throws when resend.emails.send itself throws (network failure)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSend.mockRejectedValue(new Error("network exploded"));

    const result = await sendEmail({ to: "student@example.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result.sent).toBe(false);
    expect(result.error).toBe("network exploded");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns sent:false without ever calling Resend when the API key is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendEmail({ to: "student@example.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result.sent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns sent:false without ever calling Resend when the from address is missing", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendEmail({ to: "student@example.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result.sent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("adminEmailRecipients", () => {
  it("splits two comma-separated addresses", () => {
    process.env.ADMIN_NOTIFICATION_EMAILS = "owner@abelkirar.com,manager@abelkirar.com";

    expect(adminEmailRecipients()).toEqual(["owner@abelkirar.com", "manager@abelkirar.com"]);
  });

  it("trims whitespace around each address", () => {
    process.env.ADMIN_NOTIFICATION_EMAILS = "  owner@abelkirar.com , manager@abelkirar.com  ";

    expect(adminEmailRecipients()).toEqual(["owner@abelkirar.com", "manager@abelkirar.com"]);
  });

  it("drops the empty entry left by a trailing comma", () => {
    process.env.ADMIN_NOTIFICATION_EMAILS = "owner@abelkirar.com,manager@abelkirar.com,";

    expect(adminEmailRecipients()).toEqual(["owner@abelkirar.com", "manager@abelkirar.com"]);
  });

  it("drops an exact duplicate", () => {
    process.env.ADMIN_NOTIFICATION_EMAILS = "owner@abelkirar.com,owner@abelkirar.com";

    expect(adminEmailRecipients()).toEqual(["owner@abelkirar.com"]);
  });

  it("drops a case-differing duplicate, keeping the first occurrence's casing", () => {
    process.env.ADMIN_NOTIFICATION_EMAILS = "owner@abelkirar.com,Owner@Abelkirar.com";

    expect(adminEmailRecipients()).toEqual(["owner@abelkirar.com"]);
  });

  it("returns an empty array when unset", () => {
    delete process.env.ADMIN_NOTIFICATION_EMAILS;

    expect(adminEmailRecipients()).toEqual([]);
  });
});
