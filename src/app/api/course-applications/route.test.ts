import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  clientIpFrom: (request: Request) => request.headers.get("x-forwarded-for") ?? "unknown",
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
}));

const mockCreateCourseApplication = vi.fn();
// Full mock, not importOriginal() — importing the real src/lib/course-applications.ts
// pulls in the real src/lib/db.ts, which constructs a live PrismaPg
// adapter/PrismaClient at import time (same reasoning documented in
// src/app/api/orders/route.test.ts). createCourseApplication already has its
// own dedicated unit tests (src/lib/course-applications.test.ts) — this file
// only needs to prove the route calls it correctly and handles the result.
vi.mock("@/lib/course-applications", () => ({
  createCourseApplication: (...args: unknown[]) => mockCreateCourseApplication(...args),
}));

// Same reasoning: the real module reaches Resend and next-intl's server
// runtime. Its own behaviour is covered in
// src/lib/notifications/course-application-notifications.test.ts; here we only
// prove WHEN the route calls it and that a failure cannot reach the applicant.
const mockSendNotifications = vi.fn();
vi.mock("@/lib/notifications/course-application-notifications", () => ({
  sendCourseApplicationNotifications: (...args: unknown[]) => mockSendNotifications(...args),
}));

import { POST } from "@/app/api/course-applications/route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/course-applications", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  fullName: "Jane Doe",
  country: "Ethiopia",
  isUnder15: false,
  email: "jane@example.com",
  phone: "",
  lessonLanguage: "AM",
  requestedLevel: "BEGINNER",
  kirarModel: "FIVE_STRING",
  applicantMessage: "",
};

/** A saved row, shaped as the route reads it when building notifications. */
const createdRow = {
  id: "app-1",
  fullName: "Jane Doe",
  email: "jane@example.com",
  country: "Ethiopia",
  phone: null,
  lessonLanguage: "AM",
  requestedLevel: "BEGINNER",
  kirarModel: "FIVE_STRING",
  applicantMessage: null,
  isUnder15: false,
  guardianName: null,
  guardianRelationship: null,
  guardianPhone: null,
  locale: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(true);
  mockSendNotifications.mockResolvedValue({ admin: { sent: true }, applicant: { sent: true } });
});

describe("POST /api/course-applications", () => {
  it("returns 429 and never calls the business logic when the rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue(false);

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(429);
    expect(mockCreateCourseApplication).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await POST(buildRequest("not-json"));

    expect(res.status).toBe(400);
    expect(mockCreateCourseApplication).not.toHaveBeenCalled();
  });

  it("returns 400 with the zod message when the email is invalid", async () => {
    const res = await POST(buildRequest({ ...validBody, email: "not-an-email" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("enterValidEmail");
    expect(mockCreateCourseApplication).not.toHaveBeenCalled();
  });

  it("returns 400 when fullName is missing", async () => {
    const withoutFullName: Record<string, unknown> = { ...validBody };
    delete withoutFullName.fullName;
    const res = await POST(buildRequest(withoutFullName));

    expect(res.status).toBe(400);
    expect(mockCreateCourseApplication).not.toHaveBeenCalled();
  });

  it("returns 400 when applicantMessage exceeds 1000 characters", async () => {
    const res = await POST(
      buildRequest({ ...validBody, applicantMessage: "a".repeat(1001) })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("applicantMessageTooLong");
    expect(mockCreateCourseApplication).not.toHaveBeenCalled();
  });

  it("returns 400 with fullNameTooLong when fullName exceeds 200 characters", async () => {
    const res = await POST(buildRequest({ ...validBody, fullName: "a".repeat(201) }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("fullNameTooLong");
    expect(mockCreateCourseApplication).not.toHaveBeenCalled();
  });

  it("returns 400 with phoneTooLong when phone exceeds 40 characters", async () => {
    const res = await POST(buildRequest({ ...validBody, phone: "1".repeat(41) }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("phoneTooLong");
    expect(mockCreateCourseApplication).not.toHaveBeenCalled();
  });

  it("accepts an email with surrounding whitespace and passes it trimmed to the business logic", async () => {
    mockCreateCourseApplication.mockResolvedValue(createdRow);

    const res = await POST(buildRequest({ ...validBody, email: "  jane@example.com  " }));

    expect(res.status).toBe(200);
    const [input] = mockCreateCourseApplication.mock.calls[0]!;
    expect(input.email).toBe("jane@example.com");
  });

  it("strips unknown body keys — status, locale and portalAccess never reach the business logic", async () => {
    mockCreateCourseApplication.mockResolvedValue(createdRow);

    await POST(
      buildRequest({
        ...validBody,
        status: "APPROVED",
        locale: "fr",
        portalAccess: true,
        adminNotes: "should never arrive",
      })
    );

    expect(mockCreateCourseApplication).toHaveBeenCalledTimes(1);
    const [input] = mockCreateCourseApplication.mock.calls[0]!;
    expect(input).not.toHaveProperty("status");
    expect(input).not.toHaveProperty("locale");
    expect(input).not.toHaveProperty("portalAccess");
    expect(input).not.toHaveProperty("adminNotes");
  });

  it("passes the server-derived locale, not any client-supplied value", async () => {
    mockCreateCourseApplication.mockResolvedValue(createdRow);

    await POST(buildRequest({ ...validBody, locale: "fr" }));

    const [, locale] = mockCreateCourseApplication.mock.calls[0]!;
    expect(locale).toBe("en");
  });

  it("normalizes empty optional strings to undefined before validation", async () => {
    mockCreateCourseApplication.mockResolvedValue(createdRow);

    await POST(buildRequest(validBody));

    const [input] = mockCreateCourseApplication.mock.calls[0]!;
    expect(input.phone).toBeUndefined();
    expect(input.applicantMessage).toBeUndefined();
  });

  it("rejects an empty required choice instead of normalizing it away", async () => {
    const res = await POST(buildRequest({ ...validBody, requestedLevel: "" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("selectLevel");
    expect(mockCreateCourseApplication).not.toHaveBeenCalled();
  });

  it("happy path: returns exactly {ok: true} and nothing else", async () => {
    mockCreateCourseApplication.mockResolvedValue(createdRow);

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("a P2002 duplicate (business logic returns null) produces the identical {ok: true} response", async () => {
    mockCreateCourseApplication.mockResolvedValue(null);

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("an unexpected error returns a generic 500 with no internal detail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateCourseApplication.mockRejectedValue(new Error("connection reset"));

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something went wrong");
    expect(JSON.stringify(body)).not.toContain("connection reset");
    errorSpy.mockRestore();
  });

  it("logs only the error's sanitized constructor name and code on an unexpected failure — never the error itself", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("contains jane@example.com, must not be logged"), {
      code: "P1000",
    });
    mockCreateCourseApplication.mockRejectedValue(err);

    await POST(buildRequest(validBody));

    expect(errorSpy).toHaveBeenCalled();
    const loggedArgs = errorSpy.mock.calls[0]!;
    expect(loggedArgs).not.toContain(err);
    expect(loggedArgs.join(" ")).not.toContain("jane@example.com");
    // The sanitized constructor name IS kept (not dropped) — the staging
    // verification for this phase needs it to observe the real error
    // classification a duplicate produces.
    expect(loggedArgs).toContain("Error");
    expect(loggedArgs).toContain("P1000");
    errorSpy.mockRestore();
  });

  it("logs UNKNOWN for a .code that fails the sanitization pattern, never the raw value", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("weird error"), {
      code: "not-a-valid-code jane@example.com",
    });
    mockCreateCourseApplication.mockRejectedValue(err);

    await POST(buildRequest(validBody));

    const loggedArgs = errorSpy.mock.calls[0]!;
    expect(loggedArgs).toContain("UNKNOWN");
    expect(loggedArgs.join(" ")).not.toContain("jane@example.com");
    expect(loggedArgs.join(" ")).not.toContain("not-a-valid-code");
    errorSpy.mockRestore();
  });

  it("logs a class name on the allow-list as itself — TypeError, not just the generic Error case", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateCourseApplication.mockRejectedValue(new TypeError("bad argument"));

    await POST(buildRequest(validBody));

    const loggedArgs = errorSpy.mock.calls[0]!;
    expect(loggedArgs).toContain("TypeError");
    errorSpy.mockRestore();
  });

  it("logs UNKNOWN for a class name outside the allow-list, and the raw name never appears", async () => {
    class WeirdCustomError extends Error {}
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateCourseApplication.mockRejectedValue(new WeirdCustomError("something odd"));

    await POST(buildRequest(validBody));

    const loggedArgs = errorSpy.mock.calls[0]!;
    expect(loggedArgs).toContain("UNKNOWN");
    expect(loggedArgs.join(" ")).not.toContain("WeirdCustomError");
    errorSpy.mockRestore();
  });

  describe("notifications", () => {
    it("sends exactly one pair of notifications for a genuinely new application", async () => {
      mockCreateCourseApplication.mockResolvedValue(createdRow);

      const res = await POST(buildRequest(validBody));

      expect(res.status).toBe(200);
      expect(mockSendNotifications).toHaveBeenCalledTimes(1);
      const [data] = mockSendNotifications.mock.calls[0]!;
      expect(data.id).toBe("app-1");
      expect(data.email).toBe("jane@example.com");
    });

    it("sends NOTHING for a duplicate application, while returning the identical response", async () => {
      // The single most important assertion in this file: one duplicate must
      // produce one record and one notification in total, not two. A second
      // email would also confirm to an enumerator that the address is on file.
      mockCreateCourseApplication.mockResolvedValue(null);

      const res = await POST(buildRequest(validBody));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(mockSendNotifications).not.toHaveBeenCalled();
    });

    it("still returns {ok: true} when both emails fail to send", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockCreateCourseApplication.mockResolvedValue(createdRow);
      mockSendNotifications.mockResolvedValue({
        admin: { sent: false, error: "Email is not configured" },
        applicant: { sent: false, error: "Email is not configured" },
      });

      const res = await POST(buildRequest(validBody));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      errorSpy.mockRestore();
    });

    it("still returns {ok: true} when notification dispatch throws outright", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockCreateCourseApplication.mockResolvedValue(createdRow);
      mockSendNotifications.mockRejectedValue(new Error("resend exploded"));

      const res = await POST(buildRequest(validBody));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      errorSpy.mockRestore();
    });

    it("logs the application id only — never a name, an email address or an error object", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockCreateCourseApplication.mockResolvedValue(createdRow);
      mockSendNotifications.mockResolvedValue({
        admin: { sent: false, error: "jane@example.com was rejected" },
        applicant: { sent: false, error: "jane@example.com was rejected" },
      });

      await POST(buildRequest(validBody));

      const logged = errorSpy.mock.calls.flat().join(" ");
      expect(logged).toContain("app-1");
      expect(logged).not.toContain("jane@example.com");
      expect(logged).not.toContain("Jane Doe");
      expect(logged).not.toContain("was rejected");
      errorSpy.mockRestore();
    });
  });
});
