import { Children, isValidElement, useState, useRef, useEffect, type ReactNode, type ReactElement, type FormEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import { LessonScheduleEditor } from "./lesson-schedule-editor";
import { Button } from "@/components/ui/button";
import type { AdminLessonScheduleEditor } from "@/lib/courses/lesson-schedule-views";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next-intl", async original => ({ ...await original<typeof import("next-intl")>(), useTranslations: () => createTranslator({ locale: "en", messages: en, namespace: "lessonScheduling" }) }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  return { ...react, useState: vi.fn(react.useState), useRef: vi.fn(react.useRef), useEffect: vi.fn(react.useEffect) };
});
const data: AdminLessonScheduleEditor = {
  owner: { kind: "cohort", id: "local-cohort" }, name: "Synthetic group", code: "TEST-GROUP", plan: "BEGINNER_GROUP", ownerStatus: "OPEN", terminal: false,
  state: "LEGACY", teachers: [{ id: "teacher", displayName: "Explicit teacher" }], legacy: null, revision: "initial",
  slots: [{ ordinal: 1, weekday: "SATURDAY", localStartMinute: 600, durationMinutes: 60, timeZone: "America/Chicago", effectiveStartDate: "2026-10-03", effectiveEndDate: null, state: "LEGACY", teacherAdminId: null }],
};
type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const elements = (node: ReactNode): Element[] => Children.toArray(node).flatMap(child => isValidElement(child) ? [child as Element, ...elements((child as Element).props.children)] : []);
const button = (node: ReactNode, text: string) => elements(node).find(e => e.type === Button && e.props.children === text)!;

// Same Node/SSR handler harness as the existing cohort form tests. State belongs
// to one editor instance, including its synchronous in-flight guard.
function instance(props = data) {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  return () => {
    let si = 0, ri = 0;
    vi.mocked(useState).mockImplementation((initial?: unknown): [unknown, (value: unknown) => void] => {
      const i = si++;
      if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [states[i], (value: unknown) => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
    });
    vi.mocked(useRef).mockImplementation(initial => refs[ri++] ??= { current: initial });
    vi.mocked(useEffect).mockImplementation(() => {});
    const result = LessonScheduleEditor({ data: props });
    return result;
  };
}
const fields = { teacherAdminId: "teacher", weekday1: "SATURDAY", time1: "10:00", duration1: "60", startDate: "2026-10-03", endDate: "" };
const NativeFormData = FormData;
function event(values = fields) {
  const target = {} as HTMLFormElement;
  vi.stubGlobal("FormData", class extends NativeFormData {
    constructor(form: HTMLFormElement) { super(); expect(form).toBe(target); for (const [k, v] of Object.entries(values)) this.set(k, v); }
  });
  return { currentTarget: target, preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;
}
const submit = (node: ReactNode, e: FormEvent<HTMLFormElement>) => (elements(node).find(el => el.type === "form")!.props.onSubmit as (e: FormEvent<HTMLFormElement>) => Promise<void>)(e);
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })); });
afterEach(() => { vi.unstubAllGlobals(); vi.mocked(useState).mockReset(); vi.mocked(useRef).mockReset(); vi.mocked(useEffect).mockReset(); });

it("shows legacy context without choosing the only teacher or inventing Lesson 2", () => {
  const node = instance()(), all = elements(node);
  expect(all.find(e => e.props.name === "teacherAdminId")!.props.defaultValue).toBe("");
  expect(all.find(e => e.props.name === "time1")!.props.defaultValue).toBe("10:00");
  expect(all.find(e => e.props.name === "duration1")!.props.defaultValue).toBe(60);
  expect(all.find(e => e.props.name === "weekday2")!.props.defaultValue).toBe("");
  expect(button(node, "Publish Schedule").props.disabled).toBe(true);
  expect(renderToStaticMarkup(node)).toContain("Existing schedule needs configuration");
});
it("submits one civil-time draft through the intended route and blocks a simultaneous duplicate", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const render = instance(), node = render(), e = event();
  const pending = submit(node, e); await submit(node, e);
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("/api/admin/lesson-schedules/cohort/local-cohort");
  expect(JSON.parse(init!.body as string)).toEqual({ action: "draft", draft: { teacherAdminId: "teacher", slots: [{ ordinal: 1, weekday: "SATURDAY", localStartMinute: 600, durationMinutes: 60, timeZone: "America/Chicago", effectiveStartDate: "2026-10-03", effectiveEndDate: null }] } });
  expect(button(render(), "Publish Schedule").props.disabled).toBe(true);
  resolve({ ok: true, json: async () => ({ ok: true }) } as Response); await pending;
  expect(router.refresh).toHaveBeenCalledOnce();
});
it("rejects cross-midnight or missing teacher input before fetch", async () => {
  const render = instance();
  await submit(render(), event({ ...fields, time1: "23:30" }));
  await submit(render(), event({ ...fields, teacherAdminId: "" }));
  expect(fetch).not.toHaveBeenCalled();
  expect(renderToStaticMarkup(render())).toContain("Check the teacher, weekday, time");
});
it("keeps publication disabled after unsaved edits and displays same-day feedback", () => {
  const draft = { ...data, state: "DRAFT" as const, slots: [{ ...data.slots[0], state: "DRAFT" as const, teacherAdminId: "teacher" }, { ...data.slots[0], ordinal: 2 as const, weekday: "TUESDAY" as const, state: "DRAFT" as const, teacherAdminId: "teacher" }] };
  const render = instance(draft);let node = render();
  expect(button(node, "Publish Schedule").props.disabled).toBe(false);
  (elements(node).find(e => e.type === "form")!.props.onChange as () => void)();
  (elements(node).find(e => e.props.name === "weekday2")!.props.onChange as (e: unknown) => void)({ target: { value: "SATURDAY" } });
  node = render();expect(button(node, "Publish Schedule").props.disabled).toBe(true);
  expect(renderToStaticMarkup(node)).toContain("Choose two different weekdays");
});
it("requires archive confirmation even for a terminal owner", async () => {
  const render = instance({ ...data, terminal: true });let node = render();
  expect(button(node, "Archive Schedule").props.disabled).toBe(true);
  const confirm = elements(node).filter(e => e.type === "input" && e.props.type === "checkbox").at(-1)!;
  (confirm.props.onChange as (e: unknown) => void)({ target: { checked: true } });node = render();
  expect(button(node, "Archive Schedule").props.disabled).toBe(false);
  (button(node, "Archive Schedule").props.onClick as () => void)();
  await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({ action: "archive", confirmed: true });
});
it("renders a safe conflict message without exposing raw database details", async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "conflict", details: "private student and SQL" }) } as Response);
  const render = instance();await submit(render(), event());
  const html = renderToStaticMarkup(render());
  expect(html).toContain("This teacher already has another lesson during this time");expect(html).not.toContain("private student and SQL");
});
