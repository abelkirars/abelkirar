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

import { POST } from "@/app/api/course-applications/route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/course-applications", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "",
  requestedLevel: "",
  applicantMessage: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(true);
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

  it("returns 400 when applicantMessage exceeds 2000 characters", async () => {
    const res = await POST(
      buildRequest({ ...validBody, applicantMessage: "a".repeat(2001) })
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

  it("returns 400 with phoneTooLong when phone exceeds 30 characters", async () => {
    const res = await POST(buildRequest({ ...validBody, phone: "1".repeat(31) }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("phoneTooLong");
    expect(mockCreateCourseApplication).not.toHaveBeenCalled();
  });

  it("accepts an email with surrounding whitespace and passes it trimmed to the business logic", async () => {
    mockCreateCourseApplication.mockResolvedValue({ id: "app-1" });

    const res = await POST(buildRequest({ ...validBody, email: "  jane@example.com  " }));

    expect(res.status).toBe(200);
    const [input] = mockCreateCourseApplication.mock.calls[0]!;
    expect(input.email).toBe("jane@example.com");
  });

  it("strips unknown body keys — status, locale and portalAccess never reach the business logic", async () => {
    mockCreateCourseApplication.mockResolvedValue({ id: "app-1" });

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
    mockCreateCourseApplication.mockResolvedValue({ id: "app-1" });

    await POST(buildRequest({ ...validBody, locale: "fr" }));

    const [, locale] = mockCreateCourseApplication.mock.calls[0]!;
    expect(locale).toBe("en");
  });

  it("normalizes empty phone/requestedLevel/applicantMessage to undefined before validation", async () => {
    mockCreateCourseApplication.mockResolvedValue({ id: "app-1" });

    await POST(buildRequest(validBody));

    const [input] = mockCreateCourseApplication.mock.calls[0]!;
    expect(input.phone).toBeUndefined();
    expect(input.requestedLevel).toBeUndefined();
    expect(input.applicantMessage).toBeUndefined();
  });

  it("happy path: returns exactly {ok: true} and nothing else", async () => {
    mockCreateCourseApplication.mockResolvedValue({ id: "app-1" });

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
});
