# Abel Kirar Academy — Student Dashboard Specification

**Version 1.0 — Approved reference for implementation**
**Status: direction approved by Abel Kirar. Decisions 1–7 confirmed and incorporated.**
**No code written. No files modified. No migrations run. No Supabase changes. Curriculum unchanged.**

Confidential business document.

---

## 1. Approval Record — Confirmed Decisions

These are settled and are treated as binding constraints throughout this document.

| # | Decision | Effect on this spec |
|---|---|---|
| 1 | **No automated measurements in MVP.** Teacher judges performance live and by reviewing recordings. Audio analysis is a possible future feature only. | All numeric/audio-analysis metrics removed from MVP and Phase 2. Moved to §17 Deferred. |
| 2 | **Future milestones stay hidden** until assigned. Students see achieved + current milestone + current assignment + next action only. | Progress model is Achieved + Current. No "Next" preview. Previously-open question closed. |
| 3 | **No practice timer in MVP.** | Removed from MVP. Low-priority future option in §17. |
| 4 | **Recording storage uses existing Supabase infrastructure.** Inspect existing setup before proposing anything new. | Recording architecture is written as requirements + constraints, not as a new storage design. Final design pending codebase audit. |
| 5 | **Hybrid assignment system.** Internal curriculum reference (private) + teacher-written student-facing instruction. | New §6 specifies this model in full. It is now the core data structure of the platform. |
| 6 | **Minors/privacy/consent is a launch requirement**, not an MVP blocker. Flag the product/data areas needing policy — do not invent legal requirements. | New §14 identifies the areas. No legal claims made. |
| 7 | **Damping and muting definitions confirmed; mapping to old internal entries unresolved.** Do not rename, rewrite, or attach old mechanical explanations. Use generic internal wording. | §4 states the corrected position. All screens use `current_technique` as a neutral internal field. No E32/E33/C18/E34 terminology anywhere in the platform. |

---

## 2. Updated Understanding of the Academy

- Abel Kirar Academy is a **live, one-to-one Kirar teaching program** delivered by Abel over video call. The digital platform is a **support layer around that relationship** — it does not replace the teacher, does not sequence students automatically, and is not a video course library.
- **Abel is currently the only teacher.** The data model must not permanently assume a single teacher — student records carry a teacher association from day one — but **no multi-teacher management UI is built now.** One field, not one feature set.
- **The teacher is the sequencing engine.** The platform holds state about where each student currently is, in teacher-authored language. It does not compute what comes next, auto-advance students, or expose the curriculum's forward structure.
- **The platform's core job:** hold the current assignment, collect what the student practiced and how it went, surface that to the teacher before the next live lesson, track milestones the teacher signs off, and maintain a private teaching-notes layer.
- Videos and reference materials may support a lesson. They never replace the teacher.

---

## 3. What the Platform Is For — Scope Boundary

**In scope:** current practice assignment · student progress · continue where you left off · teacher feedback · practice recordings · milestones · session history · student notes · teacher notes · next action · progress comparison over time · assessments · engagement/drop-off analytics.

**Explicitly out of scope:** self-paced video library · auto-sequencing engine · automated audio analysis · practice timer · full multi-teacher management · community/peer features · public use of student recordings.

---

## 4. Damping and Muting — Confirmed Position

**Confirmed definitions (source of truth):**

- **Damping** — a strategic Kirar-playing technique concerning how the player strategically moves or jumps from one string to another while playing.
- **Muting** — a separate, more advanced technique in which the player maintains/holds the bass part while playing the normal lead part.

**These are two distinct techniques and must never be merged.**

**Unresolved and explicitly deferred:** the mapping between these definitions and certain older internal curriculum entries (the E32/E33/C18/E34 series in the existing curriculum document). Until Abel explicitly approves that mapping:

- Original curriculum records stay unchanged.
- No old curriculum entries are renamed.
- The curriculum is not rewritten.
- No mechanical explanations are attached to damping or muting based on the old labels.
- The dashboard architecture uses the neutral internal field name `current_technique`.
- **All student-facing technique labels come from teacher-authored text.** Internal curriculum terminology is never automatically surfaced to a student.

**Correction carried forward from the earlier analysis:** the prior document treated "damping" using a generic string-instrument (subtractive muting) definition borrowed from the source curriculum, and built conclusions on it — including calling it the highest-risk early module. Those specific conclusions are **retracted**. The general structural observation (some early, technically dense skill will be the hardest to self-correct between lessons) may still hold, but cannot be attached to a named technique until the mapping is resolved. This will be handled as a separate exercise.

---

## 5. Recommended Dashboard Structure

**Student-facing navigation:**

```
Home  ·  Practice  ·  Progress  ·  Recordings  ·  Milestones  ·  History  ·  Notes
```

**Teacher/admin view (separate area):**

```
Roster  ·  Student Profile  ·  Feedback Queue  ·  Analytics  ·  Curriculum Manager (internal only)
```

**Architectural rule, stated once and applied everywhere:** the full curriculum structure is **never transmitted to a student client** — not hidden by CSS, not collapsed in an accordion, not present in a JSON payload the browser receives. Progressive disclosure is enforced **server-side**. Only current and previously-completed items are ever sent to a student session.

---

## 6. Assignment Model — Hybrid (Confirmed Decision 5)

This is the central data structure of the platform.

Every assignment has two layers:

**Layer 1 — Internal (teacher/admin only, never transmitted to student clients):**

- Optional link to an internal curriculum skill / exercise / reference ID
- Internal technique reference (`current_technique`, neutral field)
- Any private teaching rationale

**Layer 2 — Student-facing (teacher-authored):**

- A student-safe label chosen by the teacher
- Free-text practice instructions written for that specific student
- Whether a recording is required
- Optional target/goal in plain language

**Worked example:**

| Layer | Content |
|---|---|
| Internal reference *(hidden)* | `[private curriculum skill/exercise ID]` |
| Student-safe label | "String transition practice" |
| Student-facing instruction | "Practice today's string-transition exercise slowly and focus on clean movement between the strings." |
| Recording required | Yes |

**Why this shape:** the internal link gives consistent, structured progress tracking across students — which makes the analytics in §12 meaningful — while the free-text layer keeps teaching flexible and personal. Neither constrains the other. The teacher can assign without linking a curriculum reference at all if they choose; the link is optional, not required.

**Hard rule:** the internal curriculum reference is never exposed to the student in any form — not in the UI, not in an API response, not in a URL, not in a file name, not in a recording label.

---

## 7. Screen-by-Screen Specification

### A. Student Home

| | |
|---|---|
| **Student sees** | Current level/stage (teacher-authored plain-language label); one primary card — "What to practice today" from the current assignment; most recent teacher feedback (snippet, links to full); current milestone target in plain language if one is assigned. **One clear next action.** |
| **Teacher sees** | Same current state on the student's profile, plus: last submission date, last student note, inactivity flag if nothing submitted since the assignment was set. |
| **Stored** | `current_assignment_id`, `last_feedback_id`, `last_session_date`, `teacher_id` |
| **Student action** | Open assignment · mark practice complete · go to recording upload |
| **Teacher action** | Set/update current assignment · review status before a lesson |
| **Curriculum link** | Assignment may carry an internal reference; student sees only the teacher-authored label |
| **Protection** | No codes · no roadmap · no forward list · single next action only |
| **Tier** | **MVP** |

---

### B. Continue Where You Left Off

State restoration, not video resume. Runs in **two directions**.

**Restored state:**

- Current technique focus (teacher-authored label; internal field `current_technique`)
- Current exercise / song / qignit in use
- Current assignment, verbatim
- Previous performance result (teacher-noted or student self-reported)
- Teacher's last feedback, in full
- Student's own last note
- Next practice target

**Context 1 — student, before independent practice:** opens the app between lessons and sees exactly where they left off and what the teacher said last time.

**Context 2 — teacher, before the next live lesson:** opens the student profile and sees everything submitted since the last lesson in one place. Lesson prep becomes a glance rather than a search.

This is the highest-value screen in the platform for a live 1:1 model, because it solves the teacher's prep problem and the student's continuity problem with the same data.

**Tier: MVP.**

---

### C. Practice Sessions

**Flow:**

```
Start practice → see today's target → practice → 
record/upload (if required) → add note → submit → teacher review queue
```

| | |
|---|---|
| **Student sees** | Today's target; record/upload control (only if the teacher flagged the assignment as requiring one); note field; submit |
| **Teacher sees** | Review queue across all students — each entry showing assignment, recording (if any), student note, date |
| **Stored** | Assignment reference, timestamp, recording (optional), student note, status (`submitted` / `reviewed`) |
| **Student action** | Practice · record · note a problem · submit |
| **Teacher action** | Review · listen · mark reviewed · set next assignment |
| **Protection** | Student sees only their own assignment; no forward content |
| **Tier** | **MVP** |

No timer, no auto-run session template — pacing belongs to the live lesson (Decisions 1 and 3).

---

### D. Teacher Feedback

| | |
|---|---|
| **Student sees** | Feedback on their own submissions and lessons: text, optional voice note, and a short status tag |
| **Teacher sees** | Feedback composer attached to a submission or lesson; full feedback history per student |
| **Stored** | Feedback text, optional audio, linked submission/session, `teacher_id`, timestamp, status tag |
| **Student action** | Read/listen; feedback surfaces on Home and on the recording itself |
| **Teacher action** | Compose and send |
| **Tier** | **MVP** (text + status tag). **Voice note: recommended for MVP** — see note below |

**Status tags (starting set, teacher-editable later):** `On track` · `Needs more practice` · `Milestone met`

**Recommendation — voice note (flagged as a recommendation, not a curriculum requirement):** for a music teacher, a 30-second voice note conveys tone, timing and correction far faster than typing it, and it scales better as the roster grows. If it adds meaningful build cost against the existing Supabase storage setup, it can move to Phase 2 without harming the MVP. **Abel's call at implementation time.**

Deliberately kept simple: text + optional voice + one tag. Templated quick-responses are a Phase 2 scaling tool, not an MVP need.

---

### E. Recordings

| | |
|---|---|
| **Student sees** | Their own recording history, chronological, each with a date-based or teacher-written label, plus attached feedback |
| **Teacher sees** | Same history; can flag a recording as a milestone marker; can compare across time |
| **Stored** | File, date, linked assignment (internal reference), attached feedback, milestone flag |
| **Student action** | Upload · play back own recordings · read attached feedback |
| **Teacher action** | Listen · attach feedback · flag as milestone marker |
| **Protection** | **Labels must never be auto-generated from internal curriculum text.** Date-based or teacher-authored only |
| **Tier** | **MVP** — upload, history, feedback attachment, milestone flag |

**Milestone comparison** (Day 1 → milestone → milestone → now): the *flag* is MVP; the polished side-by-side comparison player is **Phase 2**. The data to support it is captured from day one.

**Note:** these are the student's own recordings of themselves. No watermarking applies — watermarking is for Academy-authored material handed *to* students (§13).

---

### F. Progress

| | |
|---|---|
| **Student sees** | Current stage name (plain language); progress within the **current stage only**; milestones already achieved; plain-language description of the current milestone target |
| **Teacher sees** | Full progress against the internal curriculum, all milestones, full history |
| **Stored** | Per-student stage, milestone statuses, achieved dates |
| **Protection** | No total session/week count · no percentage against the whole curriculum · nothing that lets a student infer overall scope · no future milestones (Decision 2) |
| **Tier** | **MVP** (simplified version above) |

**Removed per Decision 1:** all automated numeric measurement (tuning cents, timing deviation, dB evenness, tempo analysis). Not in MVP, not in Phase 2. See §17.

---

### G. Milestones and Assessments

| | |
|---|---|
| **Student sees** | Current milestone name + plain-language description; status (in progress / submitted / achieved); history of achieved milestones with dates and teacher comment |
| **Teacher sees** | Same, plus internal achievement criteria and the ability to mark a milestone achieved |
| **Stored** | Internal milestone catalog (admin-managed, never shipped whole to student clients); per-student status; achieved date; teacher sign-off |
| **Student action** | View current target; submit work toward it |
| **Teacher action** | Define criteria (admin) · assign · sign off |
| **Protection** | **Future milestones hidden** (Decision 2) · internal pass criteria hidden · assessment logic and evaluation reasoning hidden |
| **Tier** | **MVP** — current + achieved + teacher sign-off. Certificates: **Phase 2** |

**Exactly one unachieved milestone label is ever student-visible: the current focus.** "Future milestones hidden" (Decision 2) is not the same rule as "unachieved milestones hidden" — the current focus is unachieved by definition and is shown anyway, deliberately, so a student has a sense of direction rather than only a rear-view list of what they've already done. "Current focus" means specifically the single most-recently-assigned not-yet-achieved milestone. Everything beyond that one label is not shown: milestones not yet assigned to the student (future, per Decision 2), and — a narrower case worth stating explicitly — any other milestone already assigned to the student that isn't the current focus (for example, if a teacher assigns a new milestone before an older one is marked achieved, the older one is not shown until it becomes achieved). The spec previously implied both "current is visible" (this section) and "unachieved is hidden" (the informal reading of Decision 2) without reconciling them; this paragraph is the reconciliation.

**Teacher approval is required for milestone achievement.** This is deliberate: it is both pedagogically correct and the thing a copied curriculum cannot replicate.

---

### H. Session History

| | |
|---|---|
| **Student sees** | Chronological list of past lessons and practice sessions, each with a short plain-language topic label, with linked recording/feedback/note |
| **Teacher sees** | Same list plus internal references and private per-session teacher notes |
| **Stored** | Session records, type (live lesson / practice submission), date, labels, links |
| **Protection** | Backward-looking only. Nothing forward-looking is derivable from it |
| **Tier** | **MVP** — simple list view |

---

### I. Student Notes

| | |
|---|---|
| **Student sees** | Their own notes; can add a short free-text note to a submission or session |
| **Teacher sees** | All notes from their students, surfaced on the student profile and before the next lesson |
| **Stored** | Note text, linked submission/session, timestamp |
| **Purpose** | Lightweight signal to help the teacher prepare — e.g. *"String transition is difficult here."* Not a support ticket system |
| **Tier** | **MVP** |

**Recommendation (flagged as recommendation, not a requirement):** include one optional discomfort/pain flag alongside the free text, distinct from general difficulty. Physical strain in repetitive instrumental practice is easy to miss between lessons and worth surfacing explicitly. Abel's call.

---

### J. Teacher / Admin Private Notes

| | |
|---|---|
| **Student sees** | **Nothing. Never.** |
| **Teacher sees** | Private per-student observations, teaching strategy, personal context, prep reminders |
| **Stored** | Note text, `student_id`, `teacher_id`, timestamp |
| **Protection** | Server-side enforced. Must not be reachable through any student-accessible API, route, or payload |
| **Tier** | **MVP** |

This is also where teacher-only curriculum material lives if it is ever surfaced in-platform — internal methodology, diagnostic reasoning, sequencing logic. None of it reachable from a student session.

---

## 8. Student vs. Teacher/Admin Visibility Rules

| Item | Student | Teacher/Admin |
|---|---|---|
| Current assignment (student-facing layer) | ✅ | ✅ |
| Internal curriculum reference on an assignment | ❌ | ✅ |
| Current milestone (plain description) | ✅ | ✅ |
| Milestone internal criteria | ❌ | ✅ |
| **Future milestones** | ❌ | ✅ |
| Full 48-week roadmap / session sequence | ❌ | ✅ |
| Internal skill taxonomy and IDs | ❌ | ✅ |
| Teaching methodology, diagnostic reasoning | ❌ | ✅ |
| Assessment logic / answers | ❌ | ✅ |
| Internal curriculum research, weaknesses, notes | ❌ | ✅ (admin tier) |
| Full exercise / technique catalogues | ❌ | ✅ |
| Teacher training material | ❌ | ✅ |
| Own recordings and feedback | ✅ | ✅ |
| Other students' data | ❌ | Own students only; admin sees all |
| Own notes | ✅ | ✅ |
| Teacher's private notes about them | ❌ | ✅ |
| Own session history | ✅ | ✅ |
| Aggregate cross-student analytics | ❌ | ✅ (admin) |

---

## 9. Progress Model

**Horizon-limited and milestone-based, not denominator-based.**

Students see **Achieved** and **Current**. Nothing else. Per Decision 2, there is no "Next" preview — the next milestone becomes visible only when the teacher assigns it.

Progress within the current stage may be shown, provided the denominator does not reveal total curriculum scope. No global percentage, no session count, no week number.

---

## 10. "Continue Where You Left Off" Model

Field list for implementation reference (detail in §7.B):

`current_technique` (neutral internal field, teacher-authored student label) · current exercise/song/qignit · current assignment verbatim · previous performance result · teacher's last feedback (full) · student's last note · next practice target

Two views over the same data: student pre-practice, teacher pre-lesson.

---

## 11. Recording and Feedback Workflow

```
Teacher sets assignment  (recording required: yes / no)
        ↓
Student practices
        ↓
Student uploads recording (if required) + adds note
        ↓
Submission enters teacher review queue
        ↓
Teacher listens → leaves feedback (text / optional voice / status tag)
        ↓
Student notified — feedback appears on Home and on the recording
        ↓
Teacher optionally marks milestone progress
        ↓
Teacher sets next assignment
```

---

## 12. Admin Engagement and Drop-off Analytics

The teacher already knows when a student misses a *lesson* — it's on the calendar. The platform's value is surfacing what happens **between** lessons and **across** the roster.

**MVP-adjacent (simple, high value):**

- **Inactivity flag** — no practice submission within N days of an assignment being set
- **Practice completion rate** — per student

**Phase 2:**

- **Repeated-struggle flag** — same skill reassigned multiple times, or the same difficulty recurring in a student's notes
- **Milestone attempt/retry patterns** — which milestones take multiple attempts across students. Doubles as curriculum-quality signal: a milestone that is consistently hard across many students indicates a sequencing or teaching issue, not a student issue
- **Between-lesson engagement trend** — practising between lessons, or only showing up live
- **Progress slowdown** — time-in-stage lengthening relative to that student's own baseline

**Explicitly excluded (per instruction):** keystroke tracking, time-on-screen surveillance, anything beyond submission timing and the notes/tags already collected for teaching purposes. **If a metric would not help teach better, it is not tracked.**

---

## 13. Curriculum Protection Rules

**Never exposed to students:** complete 48-week roadmap · full future lesson sequence · internal teaching methodology · teacher-only explanations · teacher diagnostic methods · assessment logic or answers · internal curriculum research · internal curriculum weaknesses or notes · full exercise catalogues · full technique catalogues · full rhythmic-cycle catalogue · full Qignit teaching documentation · full retuning system · full ornament catalogue · future milestones before relevant · teacher training information · anything enabling reproduction of the teaching system.

**Enforcement principles:**

1. **Server-side gating, always.** Never rely on UI hiding. A student session receives only current + completed data.
2. **Teacher-authored student-facing text only.** Internal catalogue text is never auto-surfaced.
3. **Internal IDs stay internal.** Never in payloads, URLs, file names, or recording labels visible to students.
4. **Separate query paths.** Student-facing endpoints must not be able to return internal curriculum fields under any parameter.

**Technical protection layer:**

- Watermark Academy-authored material given to students (name + enrollment identifier), where the material warrants it
- Stream rather than download for reference material where practical — this does **not** apply to a student's own recordings, which belong to them
- Progressive access enforced server-side
- Access logging only where there is a specific concern — not a default surveillance layer

**The primary protection is the relationship, not the lock.** Live teaching · personal feedback · teacher-approved progression · the student's own accumulated history · assessments only the teacher can sign off · continually improving materials · community and certification later. A copied file replicates none of it. Effort should be weighted accordingly.

---

## 14. Privacy, Minors and Consent — Areas Requiring Policy Before Public Launch

Per Decision 6: flagged as product/data areas needing policy and consent handling. **No legal requirements are asserted here** — these are the places where policy will need to attach.

| Area | What will need a decision |
|---|---|
| **Student recordings** | Consent at upload; who may access; whether recordings may ever be used for promotion (default: no) |
| **Minors** | Whether under-18 students are enrolled; guardian consent capture at onboarding; guardian visibility of progress |
| **Retention** | How long recordings, notes and history are kept after a student leaves; deletion request handling |
| **Teacher notes** | Confirm private notes are never disclosable to the student through any export or request flow the platform offers |
| **Data export** | Whether students can export their own data, and in what form |
| **Future teachers** | What a hired teacher can see about students who are not theirs; whether they can see internal curriculum research |
| **Analytics** | Confirm aggregate analytics cannot be re-identified to an individual student in any shared view |

Recommended: capture consent at onboarding rather than retrofitting it after recordings already exist.

---

## 15. Architecture Constraints

- **Teacher association from day one.** Records that belong to a teaching relationship carry a teacher reference. No multi-teacher management UI is built now.
- **No auto-sequencing engine.** The teacher sets what comes next, indefinitely, unless a suggestion feature is explicitly requested later.
- **Existing Supabase infrastructure is the default.** Recording storage, auth, and data access should reuse what exists unless the audit shows it cannot safely support the requirement (Decision 4).
- **Server/client boundary is a security boundary,** not just an architecture preference. Curriculum protection depends on it.

---

## 16. Final MVP Scope

### ✅ Included in MVP

**Student-facing**

1. **Student Home** — current stage label, single next action, current assignment, latest feedback snippet
2. **Continue Where You Left Off** — full state restoration (student view)
3. **Practice submission** — view target → add note → upload recording if required → submit
4. **Recording upload and history** — chronological list, own recordings, attached feedback, safe labels
5. **Feedback display** — text + status tag on Home and on recordings
6. **Progress (simplified)** — current stage, achieved milestones, current milestone description
7. **Milestones** — current milestone + achieved history
8. **Session history** — simple chronological list with plain-language labels
9. **Student notes** — short free-text note attached to a submission or session

**Teacher/admin-facing**

10. **Student roster** — list of students with quick status
11. **Student profile** — mirrors student view + private teacher layer
12. **Continue Where You Left Off (teacher view)** — everything since the last lesson, for lesson prep
13. **Hybrid assignment creation** — internal curriculum reference (optional) + teacher-written student-facing instruction + student-safe label + recording-required flag
14. **Feedback composer** — text + status tag, attached to a submission or lesson
15. **Review queue** — submissions awaiting review across students
16. **Milestone sign-off** — mark a milestone achieved
17. **Private teacher notes** — per student, never student-visible
18. **Inactivity flag** — no submission within N days
19. **Practice completion rate** — per student

**Architecture / non-visual**

20. **Teacher association on relevant records** — future-proofing, no management UI
21. **Server-side curriculum protection** — enforced gating, internal IDs never sent to student clients
22. **Access control** — students reach only their own data; teacher notes server-protected

### ❌ Not in MVP

| Excluded | Status |
|---|---|
| Automated tuning / timing / tempo / audio analysis | Deferred indefinitely (Decision 1) |
| Practice timer | Deferred, low priority (Decision 3) |
| Future milestone visibility | Never (Decision 2) |
| Voice-note feedback | **Recommended for MVP — Abel's call at implementation** |
| Milestone comparison player (polished side-by-side) | Phase 2 — data captured in MVP |
| Certificates | Phase 2 |
| Full analytics dashboard | Phase 2 |
| Templated quick-feedback responses | Phase 2 |
| Scheduling / calendar integration | Phase 2 |
| Multi-teacher management UI | Deferred |
| Community / peer features | Deferred |
| Auto-sequencing engine | Not planned |
| Self-paced / video-library mode | Not planned |
| Public or marketing use of student recordings | Requires consent flow first |

---

## 17. Phase 2

Voice-note feedback (if not in MVP) · milestone comparison player · full engagement/drop-off analytics · certificates · scheduling integration · templated feedback responses · multi-teacher assignment UI.

## 18. Deferred / Future Possible

Automated audio analysis · practice timer · community and group features · peer teaching · any auto-sequencing assist.

---

## 19. Open Items

| # | Item | Owner | Blocking? |
|---|---|---|---|
| 1 | **Damping/muting ↔ old curriculum entry mapping** | Abel | Not blocking MVP build — platform uses neutral `current_technique`. Blocks any technique-specific content work |
| 2 | **Voice-note feedback in MVP or Phase 2** | Abel, at implementation | Minor scope decision |
| 3 | **Discomfort/pain flag on student notes** | Abel | Minor scope decision |
| 4 | **Inactivity threshold (N days)** | Abel | Needs a number before build |
| 5 | **Initial status tag set** | Abel | Confirm the three proposed tags |
| 6 | **Privacy/consent policy** | Abel | Not blocking MVP architecture; required before public launch |
| 7 | **Codebase audit** | Claude — pending repository access | **Blocks the implementation plan** |

---

**End of specification v1.0.** This document is the approved reference for what is being built. Implementation planning follows separately, contingent on codebase access.
