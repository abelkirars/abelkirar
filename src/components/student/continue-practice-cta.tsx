import { Button } from "@/components/ui/button";

/**
 * A same-page anchor link styled as a button — not a form, not a fetch,
 * nothing to make a client component for. The label and target are decided
 * server-side in the dashboard page from data already in scope there
 * (assignment / isSubmitted / recording); this component never receives
 * assignment content, only the pre-resolved label and an anchor id.
 *
 * There is no "resume an unfinished submission" mode — that data doesn't
 * exist (see the dashboard proposal's investigation of
 * AssignmentSubmitForm). This always points at one of the two sections
 * that already exist on the page.
 */
export function ContinuePracticeCta({
  label,
  href,
}: {
  label: string;
  href: "#weekly-practice" | "#practice-log";
}) {
  return (
    <Button size="lg" nativeButton={false} render={<a href={href} />}>
      {label}
    </Button>
  );
}
