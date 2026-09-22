import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove }),
    },
  },
}));

import {
  MAX_COURSE_PAYMENT_PROOF_BYTES,
  uploadCoursePaymentProof,
  validateCoursePaymentProof,
} from "./course-payment-proofs";

function file(bytes: number[], name: string, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.upload.mockResolvedValue({ error: null });
});

describe("course payment proof validation", () => {
  it.each([
    ["PNG", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1], "proof.png", "image/png"],
    ["JPEG", [0xff, 0xd8, 0xff, 1, 2, 0xff, 0xd9], "proof.jpeg", "image/jpeg"],
    ["PDF", [0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 0x25, 0x25, 0x45, 0x4f, 0x46], "proof.pdf", "application/pdf"],
  ])("accepts a signature-verified %s", async (_label, bytes, name, type) => {
    const result = await validateCoursePaymentProof(file(bytes as number[], name as string, type as string));
    expect(result).toMatchObject({ mimeType: type, originalFileName: name });
  });

  it("rejects empty, oversized, mismatched MIME/extension, and spoofed content", async () => {
    await expect(validateCoursePaymentProof(file([], "proof.png", "image/png"))).rejects.toThrow("non-empty");
    await expect(validateCoursePaymentProof(new File([new Uint8Array(MAX_COURSE_PAYMENT_PROOF_BYTES + 1)], "proof.png", { type: "image/png" }))).rejects.toThrow("8 MB");
    await expect(validateCoursePaymentProof(file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "proof.pdf", "image/png"))).rejects.toThrow("extension");
    await expect(validateCoursePaymentProof(file([1, 2, 3, 4], "proof.png", "image/png"))).rejects.toThrow("contents");
    await expect(validateCoursePaymentProof(file([1], "proof.gif", "image/gif"))).rejects.toThrow("PNG, JPEG, or PDF");
  });

  it("uses a generated course namespace and never a raw filename or public URL", async () => {
    const proof = await validateCoursePaymentProof(file([0xff, 0xd8, 0xff, 1, 0xff, 0xd9], "private name.jpeg", "image/jpeg"));
    const storagePath = await uploadCoursePaymentProof("payment-1", "submission-1", proof);
    expect(storagePath).toBe("course-payments/payment-1/submission-1/proof.jpg");
    expect(storagePath).not.toContain("private name");
    expect(storagePath).not.toMatch(/^https?:/);
    expect(mocks.upload).toHaveBeenCalledWith(storagePath, proof.bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });
  });
});
