@AGENTS.md

# Abel Kirar Academy

Live one-to-one Kirar teaching program. The website supports the
teacher–student relationship. It is NOT a self-paced course, an automated
curriculum sequencer, or a video library. The teacher decides what each
student works on next.

## Active work
Student Dashboard MVP. Requirements: `docs/dashboard/IMPLEMENTATION-BRIEF.md`
and `docs/dashboard/student-dashboard-spec-v1.md`. Read both before changing
dashboard code.

## Hard rules
- Curriculum protection is an AUTHORIZATION boundary, not a UI concern.
  Never send future curriculum, future milestones, internal curriculum IDs,
  internal skill taxonomy, teacher methodology, diagnostic reasoning, or
  assessment logic to a student client. Enforce server-side. Never hide
  private data with CSS.
- Internal curriculum IDs must never appear in student-visible JSON, URLs,
  labels, filenames, recording titles, HTML, or client component props.
- Private teacher notes must never reach a student session by any path.
- Student recordings are private. No public URLs.
- Do not rewrite or rename the curriculum. Damping and muting are distinct
  techniques; their mapping to old entries (E32/E33/C18/E34) is unresolved.
  Use the neutral `current_technique` field and teacher-authored labels.
- One teacher today, but do not hard-code a single-teacher assumption.
  Do not build multi-teacher management UI.

## Do not build
Automated audio analysis · AI scoring · practice timer · voice-note feedback ·
multi-teacher management · community · peer teaching · certificates ·
scheduling · auto-sequencing · self-paced mode · public recording pages ·
future milestone previews · curriculum browser.

## Before finishing any stage
Run tests, type check, lint. Fix failures before continuing.
Never deploy production without explicit authorization.
