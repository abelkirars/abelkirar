# Abel Kirar Academy — Student Dashboard MVP
## Implementation Brief (paste into a session that has repository access)

This brief is self-contained. It carries every locked decision so the implementing session does not need the earlier conversation. Pair it with **Student Dashboard Specification v1.0** (the product source of truth).

---

## Working principle

The **repository is the source of truth** for current implementation, architecture, DB conventions, Supabase usage, auth, RLS, routes, components, testing patterns, and existing features. **Spec v1.0 is the source of truth for product requirements.**

Before changing any area, inspect what exists and classify it: *already implemented · partially implemented · reusable · needs modification · genuinely missing.* Reuse existing architecture where safe. Do not duplicate what exists. Do not build the spec from scratch.

If existing implementation conflicts with the spec, **flag it and recommend a migration path — do not silently change it.**

---

## Product model (locked)

Abel Kirar Academy is a **live one-to-one Kirar teaching program**. The website supports the teacher–student relationship. It is **not** a self-paced course, an automated curriculum sequencer, or a video library. **The teacher decides what the student works on next.**

One teacher today (Abel). The data model must not permanently assume a single teacher — carry a teacher association on teaching records. **Do not build multi-teacher management UI.**

---

## Curriculum protection is an authorization boundary, not a UI concern

Students must never receive the complete curriculum structure. Never expose: full 48-week roadmap · future lesson sequence · future milestones · internal curriculum IDs · internal skill taxonomy · teacher methodology · diagnostic reasoning · assessment logic · teacher-only explanations · internal curriculum research or notes · full exercise/technique catalogues · future teaching material.

**Enforce server-side.** Do not load private curriculum data into the student's browser and hide it visually. Student APIs, server actions, loaders, queries and pages must return *only* what the student may see.

Internal curriculum IDs must not appear in student-visible JSON, URLs, labels, filenames, recording titles, HTML, or client component props.

---

## Hybrid assignment model — core architecture

Two layers per assignment.

**Internal (teacher/admin only, never returned to a student):**
- optional internal curriculum reference
- optional internal skill/exercise reference
- neutral `current_technique` reference
- private teaching rationale

**Student-facing (teacher-authored):**
- safe assignment title
- custom practice instructions
- recording required: yes/no
- optional plain-language target

Example — internal: `private curriculum reference`; student sees: **"String transition practice"** / *"Practice today's string-transition exercise slowly and focus on clean movement between the strings."*

The newest active assignment becomes the student's current assignment / next action.

---

## Damping and muting

**Do not change the curriculum.** Confirmed definitions:

- **Damping** — a strategic Kirar technique concerning how the player strategically moves or jumps from one string to another while playing.
- **Muting** — a separate, more advanced technique where the player maintains/holds the bass part while playing the normal lead part.

They are different techniques. Mapping to old entries (E32/E33/C18/E34) is **unresolved**. Therefore: do not rename those entries, do not rewrite the curriculum, do not use them as student-facing labels. Use neutral `current_technique` in architecture and teacher-authored text for anything student-facing. **This does not block the MVP.**

---

## MVP decisions (locked)

| Decision | Value |
|---|---|
| Voice-note feedback | **Phase 2.** MVP feedback = text + status tag |
| Student discomfort/pain flag | **Not MVP** |
| Inactivity threshold | **7 days** without a practice submission after an assignment is given. Store as a single configurable constant, not scattered literals |
| Feedback status tags | `On track` · `Needs more practice` · `Milestone met` — stored maintainably so they can evolve |
| Automated audio analysis | **Not MVP.** No tuning/timing/tempo analysis, no AI scoring, no automatic evaluation. The teacher evaluates |
| Practice timer | **Not MVP** |
| Future milestone visibility | **Never.** Students see achieved + current assigned milestone only |

---

## Stage plan

Run stages in the safest dependency order the actual repo supports — reorder if inspection warrants it. **After every stage:** run relevant tests → type check → lint (if configured) → check for authorization/security regressions → fix failures before continuing. Never knowingly leave the app broken between stages.

**1 — Audit & implementation map.** Inspect: `package.json`, framework/version, app routes, student + admin routes, student/admin auth, role handling, Supabase clients, migrations, RLS policies, storage buckets/policies, existing student tables, progress tables, Weekly Practice, Monthly Log, onboarding/invitations, existing APIs/server actions, components, i18n, tests, documented architecture decisions. Produce a **concise implementation map, not a giant document**, then proceed.

**2 — Data model foundation.** Minimum viable additions only, on top of what exists. Concepts needed: student · teacher association · assignment · practice submission · recording · feedback · milestone · student milestone state · session/history · student note · private teacher note. **Follow existing naming conventions; do not force these names if the schema has better equivalents. Do not create duplicate user/student tables.**

**3 — Authorization & RLS (critical).** Student may access only their own assignments, submissions, recordings, feedback, notes, current milestone, achieved milestones, session history. Student must not access another student's data, private teacher notes, internal curriculum references, future milestones, teacher-only criteria, curriculum-manager data, or methodology. Teacher/admin gets what's needed for their students. Use existing role/authorization patterns. **Protect the database/query/server layer, not just front-end routes.**

**4 — Hybrid assignment workflow.** Teacher: select student → create assignment → optionally link internal curriculum reference → write safe title → write instructions → add plain-language target → set recording-required → assign. Student receives only the student-facing layer.

**5 — Student Home.** Answers *what am I working on · what did my teacher tell me · what should I do next.* Show current stage (safe teacher-authored language), current assignment, **one visually dominant primary action**, latest feedback snippet, current milestone if assigned, practice status. No roadmap. Not a wall of equal-priority cards.

**6 — Continue Where You Left Off.** Same underlying learning-state data, two views. Student: current technique label, current exercise/song/qignit if present, current assignment, previous performance result if recorded, latest feedback, last note, current target. Teacher: everything since the last live lesson — submissions, recordings, notes, feedback state, current assignment, milestone state. Make lesson prep fast.

**7 — Practice submission.** Assignment → student opens → practices → optional recording upload if requested → optional note → submit → available to teacher. Statuses equivalent to `active` / `submitted` / `reviewed`, following project conventions. Avoid workflow complexity.

**8 — Recording upload.** **Inspect existing Supabase Storage first; reuse where appropriate.** Recordings are private. Student uploads own recording, linked to submission/assignment. Student accesses own; assigned teacher/admin accesses; other students denied. Signed/private access. Validate audio/video types. Reasonable size handling per existing patterns. **No internal curriculum IDs in filenames or labels. No public URLs. No watermarking of students' own recordings** (Academy-authored material protection is separate).

**9 — Teacher review queue & feedback.** Queue of submitted work needing review. Teacher opens submission → listens → reads note → writes feedback → picks one status → marks reviewed. Student sees feedback on the submission/recording and as the Home snippet. **No voice notes.**

**10 — Milestones & progress.** Student sees current assigned milestone, achieved milestones, achieved dates, intended teacher comments. Student does **not** see future milestones, total counts that reveal curriculum structure, internal criteria, or a full-curriculum percentage. Teacher assigns, views criteria, signs off, sees history. **Teacher sign-off required — no automatic completion.**

**11 — Student notes & private teacher notes.** Students attach short notes to submissions/sessions; teacher sees them. Private teacher notes per student must **never** appear in student API responses, server actions, page payloads, exports, or client-side data. **Add authorization tests specifically for this.**

**12 — Session history.** Chronological, backward-looking only. Student sees previous lessons, submissions, safe topic labels, linked recordings, feedback, own notes. Teacher sees additional internal info. **Never reveals future lessons.**

**13 — Inactivity & completion.** Flag a student after **7 days** with no practice submission following an active assignment — teacher/admin-facing only, non-shaming. Simple per-student practice completion rate from meaningful assignments/submissions. **No keystroke tracking, screen-time tracking, or behavioural surveillance.**

**14 — i18n.** Follow existing localization architecture. Don't hard-code UI text if translation keys are in use. Preserve existing English/Amharic support. **Never translate internal curriculum IDs or leak internal terminology through translation files delivered to student clients.**

**15 — Tests.** See below.

---

## Required tests

**Security** — student cannot access another student's assignment / recording / notes; student cannot access private teacher notes; student cannot access future milestones; student cannot access full curriculum structure; internal curriculum references absent from student payloads; unauthenticated users cannot reach protected student data.

**Teacher** — create assignment; review submission; leave feedback; sign off milestone; view private notes.

**Student** — sees current assignment; can submit practice; required-recording behaviour works; can add note; receives feedback; sees achieved/current milestones only; Continue Where You Left Off restores expected state.

**Storage** — unauthorized recording access denied; authorized student access succeeds; authorized teacher/admin access succeeds.

**Regression** — run the full existing suite; preserve behaviour outside this feature.

---

## UI/UX direction

Simple · calm · focused · mobile-friendly · easy for students · easy for Abel to manage. Student Home emphasises **one clear next action**. Never expose curriculum IDs, database statuses, internal codes, table names, or teacher-only terminology. Plain student-facing language throughout.

---

## Existing features

If Weekly Practice, Monthly Log, student progress, existing dashboard components, or onboarding exist: **do not delete or replace them automatically.** Determine whether they can become part of the new architecture. Prefer migration/adaptation over parallel duplicate systems. Preserve existing user data. If something conflicts with the spec, choose the safest migration path and document the change.

---

## Migration safety

Before applying any migration: inspect all existing migrations and related schema, identify data conflicts, make it backward-safe where practical, preserve existing student data, follow existing conventions. **Do not touch production manually.**

**If migration commands target production, or you cannot confidently determine the target database, do not run them.** Create the migration file and test locally where safe.

---

## Do not build

Automated audio analysis · AI scoring · practice timer · voice-note feedback · full multi-teacher management · community · peer teaching · certificates · scheduling/calendar integration · auto-sequencing · self-paced mode · public student recording pages · public/marketing use of student recordings · future milestone previews · complete curriculum browser.

---

## Documentation

Update existing project docs (e.g. `DECISIONS.md`) — do not create unnecessary new files. Document: hybrid assignment model · curriculum-protection boundary · recording privacy model · teacher association strategy · milestone visibility rules.

---

## Git discipline

Keep changes logically grouped. No unrelated cleanup or refactors. Do not rewrite large areas out of architectural preference. Preserve working functionality. Logical commits/checkpoints after stable stages. **Do not deploy production without explicit authorization from Abel.**

---

## Final verification before declaring MVP complete

1. Full existing test suite  2. All new tests  3. Type check  4. Lint  5. Production build locally/CI-equivalent  6. **Inspect student network/API payloads for curriculum leakage**  7. Verify cross-student access denied  8. Verify private teacher notes cannot reach student sessions  9. Verify future milestones hidden  10. Verify recordings private  11. Verify existing store/admin/student functionality still works.

## Final report format

**Implemented** · **Reused** (adapted rather than rebuilt) · **Database changes** (migrations/tables/columns/policies) · **Security** (RLS/authorization added or modified) · **Tests** (new tests + final results) · **Files changed** (major files/routes/components) · **Deferred** (Phase 2+) · **Manual testing** — a short step-by-step checklist for Abel to test the full teacher → student → practice → recording → feedback → milestone flow.

---

## Open items to confirm with Abel if they arise

1. Damping/muting ↔ old curriculum entry mapping (does not block MVP)
2. Privacy/consent + minors handling — required before public launch, not before MVP architecture. Flag where consent, recording retention, and privacy rules will need to attach; do not invent legal requirements
