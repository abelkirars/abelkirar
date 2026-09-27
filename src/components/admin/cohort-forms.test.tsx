import { Children, isValidElement, type ReactElement, type ReactNode, type FormEvent, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { CohortCreateForm, CohortScheduleForm } from "./cohort-forms";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react", async importOriginal => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: vi.fn(react.useState) };
});

const plans = [{ id: "test-group-plan", code: "BEGINNER_GROUP" }];
const fields = { coursePlanId: plans[0].id, code: "LOCAL-COHORT", name: "Local test cohort" };
const schedule = { weeklyDay: "SATURDAY", localStartTime: "10:00", durationMinutes: 60, timeZone: "America/Chicago", courseStartDate: "2026-10-03", courseEndDate: "" };
type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function elements(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement(child)) return [];
    const element = child as Element;
    return [element, ...elements(element.props.children)];
  });
}

// The repo's component tests use Node + React SSR, without a DOM dependency.
// Capture only this component's two state hooks; render its real shared
// Button/Input implementations normally. This exercises the actual handlers,
// FormData payload, async busy state, navigation and rendered HTML semantics.
// Native click/constraint-validation behavior is additionally checked in the
// isolated local browser harness, not simulated by a fake DOM here.
function instance(render: () => ReactElement, state: [unknown, unknown] = ["", false]) {
  return () => {
    for (let i = 0; i < 2; i++) {
      vi.mocked(useState).mockImplementationOnce(() => [state[i], value => { state[i] = value; }]);
    }
    return render() as Element;
  };
}

function submit(form: Element, event: FormEvent<HTMLFormElement>) {
  return (form.props.onSubmit as (event: FormEvent<HTMLFormElement>) => Promise<void>)(event);
}

function submission(values: Record<string, string>) {
  const currentTarget = {} as HTMLFormElement;
  const NativeFormData = FormData;
  vi.stubGlobal("FormData", class extends NativeFormData {
    constructor(form: HTMLFormElement) {
      super();
      expect(form).toBe(currentTarget);
      for (const [name, value] of Object.entries(values)) this.append(name, value);
    }
  });
  return { currentTarget, preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cohort: { id: "local-cohort" } }) }));
});
afterEach(() => { vi.unstubAllGlobals(); });

it("renders the real Create draft Button as the intended form's submit control", () => {
  const render = instance(() => CohortCreateForm({ plans }));
  const form = render();
  expect(form.type).toBe("form");
  const button = elements(form).find(el => el.type === Button)!;
  expect(button.props.onClick).toBeUndefined(); // No second submission path.
  expect(renderToStaticMarkup(button)).toMatch(/<button[^>]*type="submit"/);
  expect(typeof form.props.onSubmit).toBe("function");
  expect(form.props.noValidate).not.toBe(true);
});

it("submits one exact creation request, stays disabled while pending, and navigates after success", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const render = instance(() => CohortCreateForm({ plans }));
  const event = submission(fields);
  const pending = submit(render(), event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/admin/course-cohorts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
  });
  const busy = elements(render()).find(el => el.type === Button)!;
  expect(busy.props.disabled).toBe(true);
  expect(renderToStaticMarkup(busy)).toContain("Creating…");
  expect(router.push).not.toHaveBeenCalled();
  resolve({ ok: true, json: async () => ({ cohort: { id: "local-cohort" } }) } as Response);
  await pending;
  expect(fetch).toHaveBeenCalledOnce();
  expect(router.push).toHaveBeenCalledExactlyOnceWith("/admin/course-cohorts/local-cohort");
  expect(router.refresh).toHaveBeenCalledOnce();
  expect(elements(render()).find(el => el.type === Button)!.props.disabled).toBe(false);
});

it.each(["coursePlanId", "code", "name"])("retains native required validation on %s", name => {
  const form = instance(() => CohortCreateForm({ plans }))();
  const field = elements(form).find(el => el.props.name === name)!;
  expect(field.props.required).toBe(true);
  expect(renderToStaticMarkup(field)).toContain('required=""');
  expect(form.props.noValidate).not.toBe(true);
  expect(elements(form).find(el => el.type === Button)!.props.formNoValidate).not.toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

it("cannot create when no group plans are available", () => {
  const button = elements(instance(() => CohortCreateForm({ plans: [] }))()).find(el => el.type === Button)!;
  expect(button.props.disabled).toBe(true);
  expect(renderToStaticMarkup(button)).toContain('disabled=""');
  expect(fetch).not.toHaveBeenCalled();
});

it("surfaces server validation rejection without navigation or an automatic retry", async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Invalid cohort" }) } as Response);
  const render = instance(() => CohortCreateForm({ plans }));
  await submit(render(), submission(fields));
  expect(renderToStaticMarkup(render())).toContain("Invalid cohort");
  expect(fetch).toHaveBeenCalledOnce();
  expect(router.push).not.toHaveBeenCalled();
  expect(router.refresh).not.toHaveBeenCalled();
});

it("preserves schedule submit versus the independent OPEN button action", async () => {
  const render = instance(() => CohortScheduleForm({ id: "local-cohort", status: "DRAFT", schedule }), [false, ""]);
  const tree = render();
  const form = elements(tree).find(el => el.type === "form")!;
  const buttons = elements(tree).filter(el => el.type === Button);
  expect(renderToStaticMarkup(buttons[0])).toMatch(/<button[^>]*type="submit"/);
  expect(renderToStaticMarkup(buttons[1])).toMatch(/<button[^>]*type="button"/);
  expect(elements(form).includes(buttons[1])).toBe(false);
  (form.props.onSubmit as (event: FormEvent<HTMLFormElement>) => void)(submission({ ...schedule, durationMinutes: "60" }));
  await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenNthCalledWith(1, "/api/admin/course-cohorts/local-cohort", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...schedule, durationMinutes: 60, courseEndDate: null }),
  });
  (buttons[1].props.onClick as () => void)();
  await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(2));
  expect(fetch).toHaveBeenNthCalledWith(2, "/api/admin/course-cohorts/local-cohort", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "OPEN" }),
  });
});

it.each(["OPEN", "ARCHIVED"])("keeps %s cohort schedule locked and hides OPEN action", status => {
  const html = renderToStaticMarkup(<CohortScheduleForm id="local-cohort" status={status} schedule={schedule} />);
  expect(html).toMatch(/<fieldset[^>]*disabled/);
  expect(html).not.toContain("Open saved cohort");
});
