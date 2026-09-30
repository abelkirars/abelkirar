import { Children, isValidElement, useState, type ReactElement, type ReactNode, type FormEvent, type ChangeEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import am from "../../../messages/am.json";
import { MAX_COURSE_PAYMENT_PROOF_BYTES } from "@/lib/courses/course-payment-proof-limits";
import { CoursePaymentProofForm } from "./course-payment-proof-form";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), locale: "en" as "en" | "am" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-intl", async importOriginal => ({
  ...await importOriginal<typeof import("next-intl")>(),
  useTranslations: () => createTranslator({ locale: mocks.locale, messages: mocks.locale === "en" ? en : am, namespace: "coursePayment" }),
}));
vi.mock("react", async importOriginal => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: vi.fn(react.useState) };
});

type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function elements(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement(child)) return [];
    const element = child as Element;
    return [element, ...elements(element.props.children)];
  });
}

// Match the repo's Node + SSR component harness: invoke real form handlers,
// retain hook state across renders, and render the actual shared UI controls.
function instance() {
  const state: unknown[] = ["ZELLE", false, false, null, null];
  return () => {
    state.forEach((_, i) => {
      vi.mocked(useState).mockImplementationOnce(() => [state[i], value => { state[i] = value; }]);
    });
    return CoursePaymentProofForm({ paymentId: "local-payment", amount: "50.00", availableMethods: [{ method: "ZELLE", label: "Zelle" }] }) as Element;
  };
}

function proofInput(form: Element) {
  return elements(form).find(el => el.props.id === "proof")!;
}
function select(form: Element, file?: File) {
  (proofInput(form).props.onChange as (event: ChangeEvent<HTMLInputElement>) => void)({
    currentTarget: { files: file ? [file] : [] },
  } as unknown as ChangeEvent<HTMLInputElement>);
}
function proof(size: number) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], "acceptance-test.png", { type: "image/png" });
}
function submission(file: File) {
  const focus = vi.fn();
  const currentTarget = { querySelector: vi.fn(() => ({ focus })) } as unknown as HTMLFormElement;
  const NativeFormData = FormData;
  vi.stubGlobal("FormData", class extends NativeFormData {
    constructor(form: HTMLFormElement) {
      super();
      expect(form).toBe(currentTarget);
      this.set("proof", file);
      this.set("senderName", "LOCAL TEST");
      this.set("amountSent", "50.00");
      this.set("sentAt", "2026-10-03T10:00");
    }
  });
  return { event: { currentTarget, preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>, focus };
}
async function submit(form: Element, event: FormEvent<HTMLFormElement>) {
  await (form.props.onSubmit as (event: FormEvent<HTMLFormElement>) => Promise<void>)(event);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.locale = "en";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});
afterEach(() => { vi.unstubAllGlobals(); });

it.each(["en", "am"] as const)("shows localized help and an accessible size error immediately on selection (%s)", locale => {
  mocks.locale = locale;
  const messages = locale === "en" ? en : am;
  const render = instance();
  expect(renderToStaticMarkup(render())).toContain(messages.coursePayment.upload.fileHelp);
  select(render(), proof(MAX_COURSE_PAYMENT_PROOF_BYTES + 1));
  const form = render();
  expect(proofInput(form).props["aria-invalid"]).toBe(true);
  expect(proofInput(form).props["aria-describedby"]).toBe("proof-help proof-error");
  const alert = elements(form).find(el => el.props.id === "proof-error")!;
  expect(alert.props.role).toBe("alert");
  expect(alert.props.children).toBe(messages.coursePayment.upload.fileTooLarge);
  expect(fetch).not.toHaveBeenCalled();
});

it.each([3_800_001, 4_000_000, 8_388_608])("blocks %i bytes at submit even if the change handler was bypassed", async size => {
  const render = instance();
  const { event, focus } = submission(proof(size));
  await submit(render(), event);
  expect(renderToStaticMarkup(render())).toContain(en.coursePayment.upload.fileTooLarge);
  expect(focus).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it.each([100, 3_800_000])("submits a valid %i-byte proof once through the existing authenticated route", async size => {
  const render = instance();
  const file = proof(size);
  select(render(), file);
  const { event } = submission(file);
  await submit(render(), event);
  expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("/api/account/course-payments/local-payment/proof");
  expect(options?.method).toBe("POST");
  const body = options?.body as FormData;
  expect((body.get("proof") as File).size).toBe(size);
  expect(body.get("method")).toBe("ZELLE");
  expect(body.get("amountSent")).toBe("50.00");
  expect(body.has("customerId")).toBe(false);
  expect(body.has("storagePath")).toBe(false);
  // Serialize locally only: the boundary-sized proof plus normal form fields
  // still fits below 4 MB, leaving further headroom below Vercel's limit.
  const multipart = new Request("http://127.0.0.1/local-only", { method: "POST", body });
  expect((await multipart.arrayBuffer()).byteLength).toBeLessThan(4_000_000);
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(renderToStaticMarkup(render())).toContain(en.coursePayment.upload.successTitle);
});

it("clears the size error when the file is replaced or deselected and preserves supported types", () => {
  const render = instance();
  select(render(), proof(MAX_COURSE_PAYMENT_PROOF_BYTES + 1));
  select(render(), proof(100));
  expect(proofInput(render()).props["aria-invalid"]).toBeUndefined();
  select(render(), proof(MAX_COURSE_PAYMENT_PROOF_BYTES + 1));
  select(render());
  const input = proofInput(render());
  expect(input.props["aria-invalid"]).toBeUndefined();
  expect(input.props["aria-describedby"]).toBe("proof-help");
  expect(input.props.accept).toBe("image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf");
  expect(input.props.required).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
