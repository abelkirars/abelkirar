import { describe, it, expect, vi, beforeEach } from "vitest";
import en from "../../../messages/en.json";
import am from "../../../messages/am.json";

const MESSAGES: Record<string, unknown> = { en, am };

/**
 * Stands in for next-intl's real getTranslations, resolving translations
 * from the REAL messages/*.json content for whatever locale it's called
 * with — no ambient request/cookie involved at all. This directly proves
 * notifyStudentInvite threads its `locale` argument through to
 * getTranslations rather than dropping it (the bug was in i18n/request.ts
 * discarding an explicitly-passed locale in favor of the request cookie;
 * see src/i18n/request.test.ts for that layer specifically).
 */
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const root = MESSAGES[locale] as Record<string, unknown>;
    const ns = namespace
      .split(".")
      .reduce<Record<string, unknown>>((obj, key) => obj[key] as Record<string, unknown>, root);
    return (key: string, values?: Record<string, string>) => {
      let str = String((ns as Record<string, string>)[key]);
      if (values) {
        for (const [k, v] of Object.entries(values)) str = str.replaceAll(`{${k}}`, v);
      }
      return str;
    };
  },
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/notifications/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  adminEmailRecipients: () => [],
}));

vi.mock("@/lib/notifications/sms", () => ({ sendSmsToRecipients: vi.fn() }));
vi.mock("@/lib/notifications/whatsapp", () => ({ sendWhatsAppToRecipients: vi.fn() }));
vi.mock("@/lib/notifications/twilio-client", () => ({ isTwilioNotificationsEnabled: () => false }));
vi.mock("@/lib/notifications/order-notifications", () => ({ sendOrderNotifications: vi.fn() }));

import { notificationService } from "@/lib/notifications";

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue({ sent: true });
});

describe("notificationService.notifyStudentInvite locale threading", () => {
  it("renders the Amharic subject and body for an am-locale student", async () => {
    await notificationService.notifyStudentInvite(
      "amine@example.com",
      "amine",
      "https://example.com/verify?token=abc",
      "am"
    );

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: am.emails.studentInvite.subject,
        html: expect.stringContaining("ሰላም amine"),
      })
    );
  });

  it("renders the English subject and body for an en-locale student", async () => {
    await notificationService.notifyStudentInvite(
      "jane@example.com",
      "Jane",
      "https://example.com/verify?token=abc",
      "en"
    );

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: en.emails.studentInvite.subject,
        html: expect.stringContaining("Hi Jane"),
      })
    );
  });

  it("renders correctly per-call regardless of call order — no shared/cached locale state leaks between an admin's am and en students", async () => {
    await notificationService.notifyStudentInvite(
      "amine@example.com",
      "amine",
      "https://example.com/verify?token=1",
      "am"
    );
    await notificationService.notifyStudentInvite(
      "jane@example.com",
      "Jane",
      "https://example.com/verify?token=2",
      "en"
    );

    expect(mockSendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ subject: am.emails.studentInvite.subject })
    );
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ subject: en.emails.studentInvite.subject })
    );
  });
});
