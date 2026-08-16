# Project State

This file describes WHAT currently exists in this repository, verified directly from source. It does not
explain WHY decisions were made — see [docs/DECISIONS.md](DECISIONS.md) for that, and nothing here
contradicts it. Every claim below is either sourced from a specific file (cited) or marked UNVERIFIED. No
secret, key, or credential value appears anywhere in this file — variable names only.

Current branch at time of writing: `main`, working tree clean.

---

## 1. What this project is

Abelkirar is a marketing site, e-commerce store, and course/community platform for handmade Ethiopian
Orthodox instruments (Kirar, Begena, Masenqo, and others). It sells instruments via a manual-payment
checkout flow (Zelle / Cash App / EUR bank transfer, verified by an admin, not a payment processor), takes
custom-instrument quote requests, publishes courses/community content, and runs a live one-to-one Kirar
teaching program's student portal, alongside a separate admin dashboard.

The student portal (built in the stages recorded in `docs/DECISIONS.md`) currently supports, teacher-
authored and teacher-approved throughout: weekly assignments, practice submission, student recording
upload with admin playback, a practice log, teacher notes with per-note student visibility, a milestone
catalog with admin assignment and approve-only sign-off, and a per-level achievement/progress view. See §7
and §13 for exactly what each of those does and does not include — several pieces are real but not yet
visible to a student (§13).

## 2. Stack

From [package.json](../package.json) only:

| Concern | Package(s) | Version |
|---|---|---|
| Framework | `next` | `16.2.10` |
| Language | `typescript` (dev) | `^5` |
| UI | `react`, `react-dom` | `19.2.4` |
| ORM | `@prisma/client`, `prisma` (dev) | `^7.8.0` |
| DB driver adapter | `@prisma/adapter-pg`, `pg` | `^7.8.0`, `^8.22.0` |
| Database | PostgreSQL (via `datasource db { provider = "postgresql" }`, [prisma/schema.prisma:5-7](../prisma/schema.prisma#L5-L7)) | — |
| Auth (student) / Storage | `@supabase/ssr`, `@supabase/supabase-js` | `^0.12.3`, `^2.110.0` |
| Auth (admin) | `bcryptjs` (password hashing), `jose` (JWT) | `^3.0.2`, `^6.0.10` |
| Email | `resend` | `^6.17.1` |
| SMS/WhatsApp | `twilio` | `^5.10.6` |
| i18n | `next-intl` | `^4.13.3` |
| Validation | `zod` | `^4.4.3` |
| Client state | `zustand` (cart) | `^5.0.14` |
| Styling | `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/typography` (dev) | `^4` |
| Testing | `vitest`, `vite-tsconfig-paths` (dev) | `^4.1.10`, `^6.1.1` |
| Linting | `eslint`, `eslint-config-next` (dev) | `^9`, `16.2.10` |

**Hosting**: UNVERIFIED from `package.json`/schema alone (no Vercel package dependency exists, since none
is needed for Next.js apps deployed there) — but [docs/DECISIONS.md](DECISIONS.md) repeatedly and
consistently describes a Vercel Preview/Production deployment workflow (environment variable scoping,
redeploy behavior, build cache), and no `vercel.json` exists in the repo (confirmed by directory listing),
meaning Vercel's zero-config Next.js detection is relied on if that is in fact the host.

## 3. Commands

All from [package.json:5-12](../package.json#L5-L12):

| Script | What it does | Danger |
|---|---|---|
| `dev` | `next dev` — local dev server. | Safe. |
| `build` | `prisma generate && prisma migrate deploy && next build` | **Runs `prisma migrate deploy` against whatever `DATABASE_URL` is active before building.** This applies any pending migrations to that database. Also cannot be run from this local machine — every attempt fails with Prisma error P1001 (cannot reach the Supabase pooler; network limitation of this machine, not a code error). |
| `start` | `next start` — runs a production build. | Safe (assumes `build` already ran). |
| `lint` | `eslint` | Safe. |
| `test` | `vitest run` | Safe. |
| `typecheck` | `tsc --noEmit` | Safe — reads only, no DB connection (see §14). Neither `lint` nor `test` type-checks (`eslint` has no type-aware rules configured; `vitest` transpiles via esbuild and never type-checks by design), so this is the only local check that catches a type error before Vercel does. |

**Not an npm script, but relevant**: `prisma/seed.ts` (referenced by [prisma.config.ts:10](../prisma.config.ts#L10) as the `migrate`-invoked seed) calls `prisma.product.deleteMany()` unconditionally at [prisma/seed.ts:64](../prisma/seed.ts#L64) before reinserting a fixed set of products — **running the seed against a real database deletes every existing `Product` row first.** `prisma migrate dev` (which prompts to reseed) must never be used against a database with real data for this reason, on top of the general rule (see §14) that this project uses diff-and-deploy migrations, not `migrate dev`.

## 4. Database

All from [prisma/schema.prisma](../prisma/schema.prisma).

### Models (one line each)

| Model | Purpose |
|---|---|
| `Product` | A store catalog item (instrument) — price, images, per-product customization options, optional Custom Made flag. |
| `Announcement` | Admin-authored community announcement, read-only to the public. |
| `Order` | A customer order — either the manual-payment `PRODUCT` flow or the `CUSTOM_QUOTE` quote-request flow. |
| `Admin` | An admin-dashboard user account (bcrypt password hash, custom JWT session). |
| `PaymentConfirmation` | Customer-submitted proof of a Zelle/Cash App payment; never auto-marks the order paid. |
| `OrderNote` | Internal admin note attached to an order. |
| `OrderNotificationLog` | Per-attempt log of **failed** outbound order-notification emails — successes are not logged. Written by `withOrderNotificationLog()` in [src/lib/notifications/index.ts:75-93](../src/lib/notifications/index.ts#L75-L93), wrapping every `notify*` method. Surfaced in the admin orders list and order detail page (both reference it directly). |
| `RateLimitHit` | Row-per-hit backing store for the DB-based sliding-window rate limiter. |
| `OrderItem` | A line item on an order, with product name/image/price snapshotted at order time. |
| `ContactSubmission` | A contact-form submission. |
| `NewsletterSubscriber` | A newsletter signup. |
| `StudentProfile` | A student identity, mirrored from a Supabase Auth user, plus profile/status fields. No `levelEnteredAt` or equivalent field exists (checked directly — see §13.3); a student's per-level progress baseline is derived at read time from `StudentMilestone.assignedAt`, never persisted here. |
| `WeeklyPractice` | A week's practice assignment/submission for one student. Now the hybrid-assignment core: internal-only fields (`internalCurriculumRef`, `currentTechnique`, `teacherNotes`) alongside student-facing ones (`instructions`, `goals`, `recordingRequired`) and the submission/feedback fields (`studentSubmission`, `submittedAt`, `adminFeedback`, `feedbackStatus`, `feedbackAt`). |
| `WeeklyPracticeAttachment` | A file attached to a `WeeklyPractice` — **now live**, not schema-only. Student recording upload writes here (`uploadedBy: "STUDENT"`); the "one recording per submission" rule means confirming a new upload deletes the previous row/object rather than accumulating. See §7 and §9 for the actual upload/playback code paths (this corrects the prior version of this file, which said no upload/read code existed anywhere — that was true when written and is no longer true). |
| `StudentNote` | A note on a student/submission, `visibleToStudent` per row (default `true`). Student-authored notes (`addMyNote`) always write `true`; a `false` row can only come from the admin-authoring path — used today for teacher feedback the admin doesn't want the student to see yet. |
| `TeacherPrivateNote` | Schema only — **no route or UI reads or writes it anywhere in `src/`** (repo-wide search). Its leak-protection (never reachable from a student session) is real and tested, but the feature itself — a teacher actually writing one — does not exist yet. |
| `PracticeLogEntry` | A student's self-logged practice session (date, duration, focus, optional self-rating), optionally linked to a `WeeklyPractice`. |
| `Milestone` | Admin-managed milestone catalog, scoped per level. Never queried directly by student-facing code — reached only by joining through `StudentMilestone`, which is what makes an unassigned milestone structurally unreachable to a student, not just conventionally hidden. Carries `effectiveFrom` — the frozen-denominator baseline field; see §5 migration 17 and `getMyLevelProgress` in `src/lib/student/queries.ts` for the mechanism (this is a working feature, not a gap — §13's percentage caveat is about `PERCENT_READY`, not this). |
| `StudentMilestone` | Per-student milestone status (`IN_PROGRESS`/`SUBMITTED`/`ACHIEVED`), `assignedAt`, `achievedAt`, `teacherComment`, `signedOffById`. `SUBMITTED` is a defined status with no code path that ever sets it — no student-facing self-nomination exists (see §13.2); only an admin approve action ever moves a row to `ACHIEVED`. |
| `LevelReadiness` | **Schema only, deliberately unused.** Built for an admin-toggleable per-level readiness flag, superseded before any code read or wrote it — the shipped mechanism is `PERCENT_READY`, a code constant in `src/lib/level-readiness.ts` (see §13.1). Retained so the admin-toggle version could be restored without a fresh migration; no route or UI touches this table today. |
| `MonthlyLog` | An admin-authored monthly progress report for one student. Schema only — no upload/read code exists anywhere in `src/` (verified by repo-wide search; unchanged from the prior version of this file). |
| `MonthlyLogAttachment` | A file attached to a `MonthlyLog`. Schema only, same as above — no upload/read code exists. |

**`OrderItem.selectedCustomizationSnapshot`** (nullable `Json`, [prisma/schema.prisma:273](../prisma/schema.prisma#L273), added by migration 13 in §5) — written once, at order-creation time, by `buildCustomizationSnapshot()` in [src/lib/orders.ts:26-66](../src/lib/orders.ts#L26-L66), called from `createManualOrder` (not `createCustomOrder`, which has no customization options to resolve). Read on the admin order detail page ([src/app/admin/(authenticated)/orders/[orderNumber]/page.tsx](<../src/app/admin/(authenticated)/orders/[orderNumber]/page.tsx>)), which prefers it over the raw `selectedCustomization` ids and falls back to those raw ids only when the snapshot is `null` (orders placed before this existed).

### Enums and values

| Enum | Values |
|---|---|
| `ProductCategory` | `KIRAR`, `BEGENA`, `MESENKO`, `TSENATSL`, `MEKWAMIYA`, `PICK_UPS`, `KABA`, `OTHER` |
| `OrderStatus` | `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `EXPIRED`, `CANCELLED`, `REFUNDED` |
| `OrderType` | `PRODUCT`, `COURSE`, `SUBSCRIPTION`, `CUSTOM_QUOTE` |
| `ContactStatus` | `NEW`, `READ`, `RESPONDED` |
| `PaymentMethod` | `ZELLE`, `CASH_APP`, `EUR_BANK_TRANSFER`, `STRIPE_LEGACY` (legacy — no longer written; see [prisma/schema.prisma:112-113](../prisma/schema.prisma#L112-L113)) |
| `PaymentStatus` | `PENDING_VERIFICATION`, `PAID`, `PAYMENT_NOT_FOUND`, `REFUNDED`, `PENDING_QUOTE` |
| `PaymentRegion` | `US`, `EUROZONE` |
| `NotificationDeliveryStatus` | `PENDING`, `SENT`, `FAILED` |
| `Role` | `ADMIN`, `STUDENT` (only `STUDENT` is used in practice today, per [:296-301](../prisma/schema.prisma#L296-L301)) |
| `StudentStatus` | `ACTIVE`, `INACTIVE` |
| `StudentLevel` | `BEGINNER`, `INTERMEDIATE`, `ADVANCED` |
| `WeeklyPracticeStatus` | `NOT_STARTED`, `IN_PROGRESS`, `SUBMITTED`, `REVIEWED`, `COMPLETED`, `MISSED` |
| `AttachmentUploadedBy` | `ADMIN`, `STUDENT` |
| `StudentMilestoneStatus` | `IN_PROGRESS`, `SUBMITTED`, `ACHIEVED` — `SUBMITTED` is never written by any code path today (§13.2). |

### Row Level Security

Migration `20260729001047_enable_rls_deny_all` runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (zero
policies — deny-all for `anon`/`authenticated`) plus a `REVOKE ALL` on these 16 tables: `Admin`,
`Announcement`, `ContactSubmission`, `MonthlyLog`, `MonthlyLogAttachment`, `NewsletterSubscriber`, `Order`,
`OrderItem`, `OrderNote`, `PaymentConfirmation`, `Product`, `RateLimitHit`, `StudentProfile`,
`WeeklyPractice`, `WeeklyPracticeAttachment`, `_prisma_migrations`.

**Six more tables enabled RLS individually in later migrations, same deny-all/zero-policy posture:**
`StudentNote`, `TeacherPrivateNote`, `Milestone`, `StudentMilestone` (all in
`20260814090000_student_dashboard_data_model_foundation`), `PracticeLogEntry`
(`20260815100000_add_practice_log_entry`), `LevelReadiness`
(`20260817090000_add_milestone_effective_from_and_level_readiness`) — 22 tables total.

**`OrderNotificationLog` is NOT in either list — RLS is not enabled on it.** The app's own Prisma
connection uses the `postgres` role (`BYPASSRLS`), so this has no effect on application behavior either
way; noting it only for completeness/accuracy.

## 5. Migrations, in order

All 17, from `prisma/migrations/`:

1. `20260721123423_manual_payments_zelle_cashapp` — introduces manual payments (Zelle/Cash App), `Admin`, `PaymentConfirmation`, `OrderNote`, `RateLimitHit`, replacing Stripe as the active checkout flow.
2. `20260722163731_eur_bank_transfer_payment_region` — adds `EUR_BANK_TRANSFER` to `PaymentMethod`, adds `PaymentRegion` enum and `Order.paymentRegion`.
3. `20260723023000_add_order_locale` — adds `Order.locale`, backfilled to `'en'`.
4. `20260724205933_add_announcements_and_product_variant` — adds `Product.variantName` and the `Announcement` table.
5. `20260724213659_add_product_custom_made` — adds `Product.isCustomMade`, `customMadeDetails`, `customMadeImageUrl`.
6. `20260727145043_add_order_notification_tracking` — adds `NotificationDeliveryStatus` enum and `Order.smsStatus`/`whatsappStatus` (+ message SID/sentAt/error columns for each), plus `OrderItem.variantNameSnapshot`.
7. `20260728105905_add_student_platform` — adds `Role`, `StudentStatus`, `StudentLevel`, `WeeklyPracticeStatus`, `AttachmentUploadedBy` enums and the `StudentProfile`, `WeeklyPractice`, `WeeklyPracticeAttachment`, `MonthlyLog`, `MonthlyLogAttachment` tables.
8. `20260728224749_add_student_locale` — adds `StudentProfile.locale`, default `'en'`.
9. `20260729001047_enable_rls_deny_all` — enables RLS (no policies) + revokes `anon`/`authenticated` grants on the 16 tables listed in §4.
10. `20260729035713_add_student_activated_at` — adds `StudentProfile.activatedAt`.
11. `20260730022327_add_admin_password_changed_at` — adds `Admin.passwordChangedAt`.
12. `20260808160000_add_custom_quote_and_notification_log` — adds `PENDING_QUOTE`/`CUSTOM_QUOTE` enum values, `Order.customOrderDescription`/`customOrderImagePath`/`quotedAt`/`quotedById`, and the `OrderNotificationLog` table.
13. `20260811160000_add_order_item_customization_snapshot` — adds nullable `OrderItem.selectedCustomizationSnapshot Json?`. Additive only. Written and read as of this writing — see §4.
14. `20260814090000_student_dashboard_data_model_foundation` — adds `StudentMilestoneStatus` enum; hybrid-assignment columns on `WeeklyPractice` (`internalCurriculumRef`, `currentTechnique`, `recordingRequired`, `feedbackStatus`); `label`/`isMilestoneMarker` on `WeeklyPracticeAttachment`; `StudentProfile.teacherId`; and the `StudentNote`, `TeacherPrivateNote`, `Milestone`, `StudentMilestone` tables, each with RLS enabled in the same migration. Additive only.
15. `20260815100000_add_practice_log_entry` — adds the `PracticeLogEntry` table, RLS enabled in the same migration.
16. `20260815120000_add_student_note_visibility` — adds `StudentNote.visibleToStudent Boolean @default(true)`.
17. `20260817090000_add_milestone_effective_from_and_level_readiness` — adds `Milestone.effectiveFrom` (default `now()`, the frozen-denominator baseline field — see §4) and the `LevelReadiness` table (unused — see §4). Nothing on `StudentProfile`; deliberately no persisted per-student "level entered" field (§13.3).

## 6. Auth — two entirely separate systems

**Admin auth** — custom, bcrypt + JWT (`jose`), no Supabase involvement:
- Password hashing: `bcryptjs`, hash stored on `Admin.passwordHash`.
- Session: a signed JWT (HS256, 12h expiry) in an `admin_session` cookie, encoded/decoded in [src/lib/admin/session.ts](../src/lib/admin/session.ts) (`encryptSession`/`decryptSession`, secret from `ADMIN_SESSION_SECRET`).
- DAL entry points: [src/lib/admin/dal.ts](../src/lib/admin/dal.ts) — `verifyAdminSession()` (re-checks `Admin.isActive` and `passwordChangedAt` against the DB on every call, memoized per-request via React `cache()`), `requireAdminPage()` (redirects to `/admin/login`), `requireAdminApi()` (returns a 401 `NextResponse`).
- Optimistic pre-check in [src/proxy.ts](../src/proxy.ts) for `/admin/:path*` — cookie signature/expiry only, no DB hit; the real check still happens in the DAL on every page/route.

**Student auth** — Supabase Auth, entirely separate:
- Identity lives in Supabase's own `auth.users`; `StudentProfile.supabaseUserId` mirrors it.
- Session read via `supabase.auth.getUser()` (always a network round-trip to Supabase's Auth server — deliberately not the local-only `getSession()`), in [src/lib/student/session.ts](../src/lib/student/session.ts) (`readStudentAuthUser()`).
- DAL entry points: [src/lib/student/dal.ts](../src/lib/student/dal.ts) — `resolveStudentSession()` (returns `unauthenticated` / `orphaned` / `inactive` / `active`, re-checking `StudentProfile.status === ACTIVE` against the DB), `requireStudentPage()`, `requireStudentApi()`.
- [src/proxy.ts](../src/proxy.ts) handles `/student/:path*` too — performs a real Supabase `getUser()` call (for cookie/token refresh, since only middleware/Proxy can write cookies in Next.js) and redirects unauthenticated visitors, except for three explicitly public paths: `/student/login`, `/student/set-password`, `/student/forgot-password`.

**These two systems do not share code, sessions, cookies, or tables.** Admin auth does not use Supabase in any way; student auth does not use the `admin_session` cookie or `jose` JWTs.

## 7. Routes

**Public / unauthenticated:**
- Pages: `/`, `/about`, `/blog`, `/blog/[slug]`, `/community`, `/contact`, `/courses`, `/courses/[slug]`, `/store`, `/store/[slug]`, `/store/cart`, `/store/order/[orderNumber]`, `/admin/login`, `/student/login`, `/student/forgot-password`, `/student/set-password`.
- API: `POST /api/contact`, `POST /api/newsletter`, `POST /api/orders`, `GET /api/orders/[orderNumber]` (order lookup by unguessable order number — grepped `src/` for any caller and found none; appears unused by current client code but is still a live, public route), `POST /api/orders/[orderNumber]/confirm-payment`, `POST /api/custom-orders`, `POST /api/admin/login`, `POST /api/admin/logout` (both intentionally public — logging in/out requires no prior session), `POST /api/student/forgot-password`, `POST /api/student/set-password` (deliberately skips `requireStudentApi()` per its own comment at [src/app/api/student/set-password/route.ts:14](<../src/app/api/student/set-password/route.ts#L14>) — the invite/reset token itself is the credential).

**Correction to the prior version of this file:** it claimed `GET /api/admin/seed` had no `requireAdminApi()`
call and was genuinely public. Checked directly — that is no longer true. [src/app/api/admin/seed/route.ts:190](../src/app/api/admin/seed/route.ts#L190)
calls `requireAdminApi()` as its first line, same as its `POST` sibling. Both methods on this route are
admin-gated today; there is no public admin/seed endpoint.

**Admin-gated** (`requireAdminApi`/`requireAdminPage`, confirmed present in each file):
- Pages: `/admin/(authenticated)/orders`, `/admin/(authenticated)/orders/[orderNumber]`, `/admin/(authenticated)/products`, `/admin/(authenticated)/products/[id]/customization`, `/admin/(authenticated)/announcements`, `/admin/(authenticated)/settings`, `/admin/(authenticated)/students`, `/admin/(authenticated)/students/[studentId]` (student profile page — weekly assignments create/edit, student notes with visibility toggle, and milestone assign/approve all live here, in addition to the existing profile-edit/status/invite controls), `/admin/(authenticated)/milestones` (the milestone catalog: create/edit, grouped by level), `/admin/(authenticated)/upload-images`.
- API, orders/products/announcements (unchanged from the prior version of this file): `POST /api/admin/announcements`, `/api/admin/announcements/[id]`, `POST /api/admin/orders/[orderNumber]/{cancel,mark-not-found,mark-paid,note,quote,quote/resend}`, `GET /api/admin/orders/[orderNumber]/screenshot/[confirmationId]`, `GET /api/admin/orders/[orderNumber]/custom-order-image`, `POST /api/admin/products`, `/api/admin/products/[id]`, `DELETE /api/admin/products/[id]/images`, `PATCH /api/admin/products/[id]/customization-options`, `POST /api/admin/products/[id]/customization-choice-image`, `POST /api/admin/seed`, `POST /api/admin/settings/password`, `POST /api/admin/students`, `/api/admin/students/[studentId]`, `/api/admin/students/[studentId]/email`, `/api/admin/students/[studentId]/resend-invite`, `POST /api/admin/update-instrument-images`, `POST /api/admin/upload-instrument-images`.
- API, student-dashboard admin side (new): `POST /api/admin/students/[studentId]/weekly-practice` (create an assignment), `PATCH .../weekly-practice/[weeklyPracticeId]` (edit — status is only settable to `NOT_STARTED`/`IN_PROGRESS`/`MISSED`; `SUBMITTED`/`REVIEWED`/`COMPLETED` are never admin-settable directly, see §13.4), `GET .../weekly-practice/[weeklyPracticeId]/recordings/[attachmentId]` (mints a signed URL and streams the student's recording — this is the admin playback path), `POST .../notes` / `PATCH` + `DELETE .../notes/[noteId]` (teacher notes, `visibleToStudent` toggle), `POST /api/admin/milestones` (create in the catalog), `PATCH /api/admin/milestones/[milestoneId]` (edit), `POST .../students/[studentId]/milestones` (assign an existing catalog milestone to a student — 404s if the milestone doesn't exist), `PATCH .../students/[studentId]/milestones/[studentMilestoneId]` (approve: sets `ACHIEVED`, `achievedAt`, `signedOffById` from the session — never client-suppliable; 404s if the row's `studentId` doesn't match the URL).

**Student-gated** (`requireStudentPage`/proxy redirect):
- Pages: `/student/dashboard` — reachable as a URL by anyone but redirected pre-render by `src/proxy.ts`, and the page itself additionally calls `requireStudentPage()`. **Correction to the prior version of this file:** it quoted a "the real dashboard is Phase 5" placeholder comment from this page — that comment no longer exists in the file (checked directly); the page is a real, populated dashboard today. See §1 and §13 for what it does and does not show.
- API: `POST /api/student/practice-log` (log a practice session), `POST /api/student/submit-assignment` (submit the current assignment — blocks resubmission once `SUBMITTED`/`REVIEWED`/`COMPLETED`, blocks submission if `recordingRequired` and no recording attachment exists), `POST /api/student/recordings/upload-url` (mints a signed upload URL, verifies the caller owns the target assignment first), `POST /api/student/recordings/confirm` (records the completed upload as a `WeeklyPracticeAttachment`, re-verifies the stored object's actual size/mimeType server-side rather than trusting the client's declared values — deletes any prior recording on the same assignment first, "one recording per submission"), `GET /api/student/recordings/[attachmentId]` (mints a signed URL and streams the student's own recording back — same mechanism as the admin playback route, scoped to the caller's own attachment).

**Client vs. server rendering for product images**: `/store/[slug]` renders both photos and the
customization form through [ProductDisplay](../src/components/store/product-display.tsx) (`"use client"`),
a thin wrapper introduced to share one `selectedImage` state between
[ProductGallery](../src/components/store/product-gallery.tsx) and
[CustomizationForm](../src/components/store/customization-form.tsx) — picking an `image-select` choice
swaps the main product image, and tapping a gallery thumbnail afterward overrides it back, with no
priority logic (whichever was touched most recently wins, since both write the same `useState`).
`ProductDisplay` renders as a Fragment (not a wrapping `<div>`), so it still slots into the page's
`grid-cols-2` layout as two direct children. `ProductGallery` itself stays usable standalone — its
`selectedImage`/`onSelectImage` props are optional, falling back to its original self-contained behavior
when omitted. The store grid (`/store`, via `ProductCard`) still uses the plain server-rendered
[ProductVisual](../src/components/store/product-visual.tsx) directly and ships no gallery JavaScript. The
two were kept as separate components deliberately, rather than making `ProductVisual` itself conditionally
interactive, so the grid's bundle stays unaffected by the detail page's gallery.

**Store search**: `/store` accepts `?q=` (case-insensitive, via Prisma `contains` + `mode: "insensitive"`
against `name`/`variantName`/`description`) alongside the pre-existing `?category=`, but the two are
mutually exclusive, not composable — [src/app/store/page.tsx:87-88](../src/app/store/page.tsx#L87-L88)
computes `categoryFilter` as `undefined` whenever a search is active, so a URL carrying both params has
search win rather than ANDing to zero results. Submitted via a plain `<form action="/store">` (default
GET) — no client component, no JS required for the search itself. A search always shows individual
products, never the grouped-by-category cards `groupIntoCards()` produces for the unfiltered browse view.

## 8. Environment variables

Every `process.env.*` reference in `src/` and `scripts/`, grouped by feature:

**Database**
- `DATABASE_URL` — [src/lib/db.ts](../src/lib/db.ts). Runtime. Without it, the Prisma driver adapter can't connect; every DB-touching request fails.
- `DIRECT_URL` — read via `env("DIRECT_URL")` in [prisma.config.ts:16](../prisma.config.ts#L16), not a literal `process.env` string. CLI-only (`migrate`/seed), not read by the running app.

**Supabase**
- `NEXT_PUBLIC_SUPABASE_URL` — multiple files (student auth, storage). **Build-time-inlined** (`NEXT_PUBLIC_` prefix) — baked into the client bundle by `next build`; missing at build time means it's `undefined` for every visitor, not a runtime failure.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — [src/proxy.ts](../src/proxy.ts), [src/lib/supabase-server.ts](../src/lib/supabase-server.ts), [src/lib/supabase-browser.ts](../src/lib/supabase-browser.ts). **Build-time-inlined**, same as above — per `docs/DECISIONS.md`'s 2026-08-09 entry, this one was missing from Vercel entirely at merge time and was added before merging specifically because a missing value silently breaks the whole student-auth client bundle rather than throwing.
- `SUPABASE_SERVICE_ROLE_KEY` — [src/lib/supabase-admin.ts](../src/lib/supabase-admin.ts) and admin upload routes. Runtime, server-only (not `NEXT_PUBLIC_`).
- `SUPABASE_PAYMENT_SCREENSHOTS_BUCKET` — [src/lib/payment-screenshots.ts:8](../src/lib/payment-screenshots.ts#L8). Runtime; falls back to the literal `"payment-screenshots"` if unset (no crash).
- `SUPABASE_CUSTOM_ORDER_IMAGES_BUCKET` — [src/lib/custom-order-images.ts:4](../src/lib/custom-order-images.ts#L4). Runtime; optional, falls back to the literal `"custom-order-images"` if unset (no crash) — same pattern as the payment-screenshots var above.
- `SUPABASE_STUDENT_FILES_BUCKET` — [src/lib/student-recordings.ts:12](../src/lib/student-recordings.ts#L12). Runtime; falls back to the literal `"student-files"` if unset — **a bucket that does not exist**; the real bucket is `student-recordings` (see §9 and `docs/DECISIONS.md`'s Stage 8 entry, which traced a real production-shaped failure to exactly this). Confirmed present as a key in local `.env.local` (checked the key only — no value read or printed here, consistent with this file's no-secrets rule). **UNVERIFIED whether it is set in Vercel Preview/Production** — I have no access to the Vercel dashboard from here, and `.env.local` is git-ignored, so a local fix does not imply a deployed one. If it is unset in either Vercel environment, every recording upload there fails with the same generic "Failed to prepare upload" error until it's set there too.

**Resend / email**
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — [src/lib/resend.ts](../src/lib/resend.ts), [src/lib/notifications/email.ts](../src/lib/notifications/email.ts), and directly in `/api/contact` and `/api/newsletter`. Runtime; `sendEmail()` no-ops with a logged warning if either is unset (does not crash). The direct `resend.emails.send()` calls in contact/newsletter have no such guard beyond an `if` check before calling.
- `ADMIN_NOTIFICATION_EMAILS` — [src/lib/notifications/email.ts](../src/lib/notifications/email.ts). Runtime; empty means zero admin order-notification emails, explicitly reported as a non-`sent` result (fixed in commit `6ed5e82`, see DECISIONS.md).
- `CONTACT_NOTIFICATION_EMAIL` — [src/app/api/contact/route.ts](../src/app/api/contact/route.ts) only. Runtime.

**Manual payment instructions**
- `ZELLE_RECIPIENT_NAME`, `ZELLE_RECIPIENT_EMAIL_OR_PHONE`, `ZELLE_ADDITIONAL_INSTRUCTIONS`, `CASHAPP_CASHTAG`, `CASHAPP_ADDITIONAL_INSTRUCTIONS` — [src/lib/notifications/payment-instructions.ts](../src/lib/notifications/payment-instructions.ts). Runtime; unset values render literal `"(...not configured)"` placeholder text to customers rather than crashing.

**Twilio**
- `TWILIO_NOTIFICATIONS_ENABLED` — [src/lib/notifications/twilio-client.ts](../src/lib/notifications/twilio-client.ts). Runtime; must be the exact string `"true"` or every Twilio send path no-ops.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM_NUMBER`, `TWILIO_SMS_RECIPIENTS`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_RECIPIENTS` — same file plus `sms.ts`/`whatsapp.ts`/`order-notifications.ts`. Runtime; all no-op safely if missing.

**Admin auth**
- `ADMIN_SESSION_SECRET` — [src/lib/admin/session.ts:22-26](../src/lib/admin/session.ts#L22-L26). Runtime; **throws** (`"ADMIN_SESSION_SECRET is not set"`) the moment any admin session is signed or verified if unset — this one does crash, unlike most others here.
- `ADMIN_USERNAME`, `ADMIN_NEW_PASSWORD` — `scripts/change-admin-password.ts` only. Not part of the app build or runtime at all — a manually-run CLI script.

**App-wide**
- `NEXT_PUBLIC_SITE_URL` — used to build absolute links in admin notification emails across most order/quote routes. **Build-time-inlined** in the sense that it's `NEXT_PUBLIC_`, though its only observed uses are server-side string concatenation, not client rendering; still inlined into any client bundle that might reference it.
- `NODE_ENV` — [src/lib/db.ts](../src/lib/db.ts), [src/lib/admin/session.ts](../src/lib/admin/session.ts). Set automatically by Next.js/Node, not something to configure manually.

## 9. Storage

- **`product-images`** bucket — **public**. Written by [src/lib/public-image-upload.ts](../src/lib/public-image-upload.ts) (`uploadPublicImage`, service-role client) under folders like `products/`, `announcements/`, `custom-made/`, and `customization-choices/` (written by `POST /api/admin/products/[id]/customization-choice-image`, called from `CustomizationChoiceEditor` — §7). URLs are constructed directly as `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}` — a plain unauthenticated HTTP GET, no anon key, no PostgREST call involved in viewing. Editing a product's gallery **appends** rather than replaces — `PATCH /api/admin/products/[id]` never deletes existing images as a side effect of adding more; deletion is a separate action, `DELETE /api/admin/products/[id]/images`, which updates `Product.images` before attempting the Storage delete (a Storage failure then leaves a harmless orphaned file, never a dangling DB reference). The admin edit form ([src/components/admin/product-form.tsx](../src/components/admin/product-form.tsx)) renders each existing image as a thumbnail with its own delete control — the create form shows no gallery, since a new product has no existing images yet. `PATCH /api/admin/products/[id]/customization-options` follows the same append/orphan-cleanup shape for choice images: a whole-array replace of `Product.customizationOptions`, diffing old vs. new choice `imageUrl`s and best-effort-deleting whatever dropped out ([route.ts](../src/app/api/admin/products/[id]/customization-options/route.ts)), same DB-write-first-then-cleanup ordering as the two routes above. Uploading a choice image ahead of save and then abandoning the edit without saving orphans that file — a known, accepted, low-cost gap (no draft/session concept exists to catch it).
- **`payment-screenshots`** bucket (name from `SUPABASE_PAYMENT_SCREENSHOTS_BUCKET`, default `"payment-screenshots"`) — **private**. Written/read by [src/lib/payment-screenshots.ts](../src/lib/payment-screenshots.ts) via the service-role client; only the object *path* is stored on `PaymentConfirmation.screenshotPath`, never a public URL. Viewing requires a short-lived signed URL (`getPaymentScreenshotSignedUrl`, default 300s), minted only from the admin-gated screenshot route.
- **`custom-order-images`** bucket (name from `SUPABASE_CUSTOM_ORDER_IMAGES_BUCKET`, default
  `"custom-order-images"`) — **private**. Written/read by [src/lib/custom-order-images.ts](../src/lib/custom-order-images.ts)
  via the service-role client, mirroring `payment-screenshots.ts` exactly: only the object *path* is
  stored on `Order.customOrderImagePath`, never a public URL; viewing requires a signed URL minted only
  from the admin-gated `custom-order-image` route. Created manually in Supabase (see `docs/DECISIONS.md`'s
  2026-08-10 Phase 3 entry) — not something any code provisions.
- **`student-recordings` bucket** (name comes from `SUPABASE_STUDENT_FILES_BUCKET`; the code's own fallback literal, `"student-files"`, is a bucket that does not exist — see §8) — **private**, per [src/lib/student-recordings.ts:6](../src/lib/student-recordings.ts#L6)'s own doc comment. **Live and read/written today** — this corrects the prior version of this file, which said no upload/read code existed anywhere for this bucket; that was true when written and is not true now. Student upload: `createRecordingUploadUrl` mints a signed upload URL after verifying the caller owns the target `WeeklyPractice`; on confirm, `confirmMyRecordingUpload` (in `src/lib/student/queries.ts`) re-verifies the actual stored object's size and mimeType server-side via `verifyRecordingObject` — never trusts the client's declared values — and stores the verified values, not the client-declared ones. Max size 50MB (`MAX_RECORDING_BYTES`). "One recording per submission": confirming a new upload deletes the previous object and row rather than accumulating, so `createdAt` reflects a genuine new row rather than a manually-overridden default. Viewing (both student's-own and admin) goes through a short-lived signed URL minted on demand by a dedicated route — never a public URL, never embedded in page props. `WeeklyPracticeAttachment.storagePath` and `MonthlyLogAttachment.storagePath` both carry a schema doc-comment reading "the private student-files bucket" — that's the code's fallback literal, not the actual configured bucket name, and `MonthlyLogAttachment` still has no code path of its own; `MonthlyLog`/`MonthlyLogAttachment` remain schema-only (§4).

## 10. Notifications — every email the system sends

Via `notificationService` ([src/lib/notifications/index.ts](../src/lib/notifications/index.ts)):

| Method | Trigger | Audience |
|---|---|---|
| `notifyCustomerOrderPending` | Customer places a manual-payment order (`POST /api/orders`) | Customer |
| `notifyAdminNewOrder` | Same | Admin (+ SMS/WhatsApp via `sendOrderNotifications`, if `TWILIO_NOTIFICATIONS_ENABLED`) |
| `notifyCustomerCustomOrderPending` | Customer submits a Custom Made quote request (`POST /api/custom-orders`) | Customer |
| `notifyAdminNewCustomOrder` | Same | Admin |
| `notifyAdminPaymentSubmitted` | Customer submits payment-confirmation details | Admin (+ SMS/WhatsApp) |
| `notifyCustomerPaymentConfirmed` | Admin clicks "Mark as paid" | Customer |
| `notifyAdminPaymentConfirmed` | Same | Admin (+ SMS/WhatsApp) |
| `notifyAdminPaymentNotFound` | Admin clicks "Mark payment not found" | Admin (+ SMS/WhatsApp) |
| `notifyAdminOrderCancelled` | Admin clicks "Cancel order" | Admin (+ SMS/WhatsApp) |
| `notifyCustomerQuoteReady` | Admin sets a quote (`POST /quote`) or resends it (`POST /quote/resend`) | Customer |
| `notifyAdminQuoteSent` | Same as above (`POST /quote` and `POST /quote/resend`) | Admin (+ SMS/WhatsApp) — missing from the prior version of this table; confirmed present in `src/lib/notifications/index.ts` and called from both routes |
| `notifyStudentInvite` | Admin creates a student / resends an invite | Student |
| `notifyStudentPasswordReset` | Student uses `/student/forgot-password` | Student |

**Two more emails exist outside `notificationService` entirely**, sent via a direct `resend.emails.send()` call with no result inspection at all (not even the try/catch-only pattern the order routes had before `6ed5e82`/`8097b91`):
- `POST /api/contact` — admin notification of a new contact-form submission, to `CONTACT_NOTIFICATION_EMAIL`.
- `POST /api/newsletter` — presumably a welcome email (uses `emails.newsletterWelcome`, per the message-file namespace of the same name); not routed through `sendEmail()`/`notificationService` at all.

Neither of these two benefits from the `{sent, error}` result-inspection hardening — a genuine, unaddressed gap of the same shape documented in `docs/DECISIONS.md`'s 2026-08-08 entry.

## 11. i18n

- Locales: `en`, `am` ([src/i18n/locale.ts](../src/i18n/locale.ts)), default `en`.
- Resolution ([src/i18n/request.ts](../src/i18n/request.ts)): an explicit `locale` param (used when sending a notification in a stored student/order locale) takes priority; otherwise falls back to the `NEXT_LOCALE` cookie; otherwise the default.
- Message files: `messages/en.json`, `messages/am.json`.
- **97** keys in `messages/am.json` currently carry an `[AM] ` placeholder-English prefix — verified two
  independent ways just now (a script walking the full JSON tree, and a raw count of `[AM]` occurrences;
  both agree exactly), not carried over from any prior count in this file or in `docs/DECISIONS.md`. Full
  per-key breakdown, grouped by namespace: `docs/AMHARIC_TODO.md`.
- **`studentDashboard` (42 keys) is among the untranslated namespaces**, plus 8 of the 10 keys in the
  shared `validation` namespace (practice log, submission, and recording validation messages specifically
  — the other 2 are storefront custom-order validation). A student who selects Amharic sees the `[AM]`
  prefix throughout their own dashboard today, not only in storefront/marketing text — 52 of the 97 keys
  are student-facing. `docs/AMHARIC_TODO.md` lists these namespaces first for exactly this reason.

## 12. Tests

Ran `npx prisma generate` first (offline-safe, no DB connection — the standing convention after any schema
change, per §14), then `npm run test`:
```
Test Files  37 passed (37)
     Tests  329 passed (329)
```
**Exact counts, not approximate.** All 37 files, all `.test.ts` — confirmed **zero** `*.test.tsx` files
anywhere in `src/` (checked via a glob for `src/**/*.test.tsx`; matches none). No React component has a
test.

37 test files: `src/app/actions/sync-student-locale.test.ts`, `src/app/api/admin/milestones/route.test.ts`, `src/app/api/admin/milestones/[milestoneId]/route.test.ts`, `src/app/api/admin/orders/[orderNumber]/mark-not-found/route.test.ts`, `src/app/api/admin/orders/[orderNumber]/mark-paid/route.test.ts`, `src/app/api/admin/orders/[orderNumber]/quote/resend/route.test.ts`, `src/app/api/admin/orders/[orderNumber]/quote/route.test.ts`, `src/app/api/admin/settings/password/route.test.ts`, `src/app/api/admin/students/route.test.ts`, `src/app/api/admin/students/[studentId]/email/route.test.ts`, `src/app/api/admin/students/[studentId]/milestones/route.test.ts`, `src/app/api/admin/students/[studentId]/milestones/[studentMilestoneId]/route.test.ts`, `src/app/api/admin/students/[studentId]/notes/route.test.ts`, `src/app/api/admin/students/[studentId]/notes/[noteId]/route.test.ts`, `src/app/api/admin/students/[studentId]/weekly-practice/[weeklyPracticeId]/recordings/[attachmentId]/route.test.ts`, `src/app/api/custom-orders/route.test.ts`, `src/app/api/orders/route.test.ts`, `src/app/api/orders/[orderNumber]/confirm-payment/route.test.ts`, `src/app/api/student/forgot-password/route.test.ts`, `src/app/api/student/practice-log/route.test.ts`, `src/app/api/student/recordings/confirm/route.test.ts`, `src/app/api/student/recordings/[attachmentId]/route.test.ts`, `src/app/api/student/recordings/upload-url/route.test.ts`, `src/app/api/student/set-password/route.test.ts`, `src/app/api/student/submit-assignment/route.test.ts`, `src/i18n/request.test.ts`, `src/lib/admin/dal.test.ts`, `src/lib/notifications/email.test.ts`, `src/lib/notifications/index.test.ts`, `src/lib/notifications/order-notifications.test.ts`, `src/lib/notifications/templates.test.ts`, `src/lib/orders.test.ts`, `src/lib/phone.test.ts`, `src/lib/student/dal.test.ts`, `src/lib/student/queries.test.ts`, `src/lib/student-recordings.test.ts`, `src/lib/validations/customization-options.test.ts`.

For the Prisma-mocking, `$transaction`, and `next-intl` conventions these route tests follow (and when
`@/lib/orders` needs a full mock vs. can be imported for real), see `docs/DECISIONS.md`'s 2026-08-10
"Order and payment test coverage" entry rather than duplicating that reasoning here.
`src/lib/student/queries.test.ts` follows a different, heavier convention worth knowing about separately:
a fake in-memory Prisma-simulating backing store (not simple `vi.fn()` mocks) that actually applies `where`
filtering and `select` narrowing, including nested relation selects — because a bare mock can't prove a
query really scopes by `studentId` or really excludes a field, it can only prove the code called
`prisma.x.y()` at all.

**Every API route, checked directly against its own test file** (47 `route.ts` files under `src/app/api`,
24 have a matching `route.test.ts` — 23 do not):

**Untested — unchanged from the prior version of this file:** `GET /api/orders/[orderNumber]` (unused public order-lookup route, §7); `POST /api/admin/orders/[orderNumber]/{cancel,note}`, `GET /api/admin/orders/[orderNumber]/screenshot/[confirmationId]`, `GET /api/admin/orders/[orderNumber]/custom-order-image`; every admin CRUD route for products and announcements (`/api/admin/products`, `/api/admin/products/[id]`, `/api/admin/products/[id]/images`, `/api/admin/products/[id]/customization-options`, `/api/admin/products/[id]/customization-choice-image`, `/api/admin/announcements`, `/api/admin/announcements/[id]`); `/api/contact`, `/api/newsletter`, `/api/admin/seed`, `/api/admin/upload-instrument-images`, `/api/admin/update-instrument-images`, `/api/admin/students/[studentId]`, `/api/admin/students/[studentId]/resend-invite`, `/api/admin/login`, `/api/admin/logout`.

**Untested — new, part of the student-dashboard admin surface:** `POST /api/admin/students/[studentId]/weekly-practice` (create an assignment) and `PATCH .../weekly-practice/[weeklyPracticeId]` (edit) have **no test coverage at all** — notable specifically because their siblings on the same student-dashboard surface (notes, milestones, recording playback) all do have tests. This is a real, current gap, not a stale claim.

**Non-route areas still with no test coverage** (unchanged from the prior version of this file): `src/lib/rate-limit.ts`, `src/lib/order-number.ts`, `src/lib/pricing.ts`, `src/lib/payment-screenshots.ts`, `src/lib/custom-order-images.ts`, `src/lib/public-image-upload.ts`, `src/proxy.ts` itself (its locale-resolution dependency, `src/i18n/request.ts`, has a test; the routing/redirect/cookie-refresh logic in `proxy.ts` does not).

**Now covered, since the prior version of this file:** every student-dashboard route listed in §7 except the two weekly-practice admin routes named above — practice log, assignment submission, recording upload/confirm/playback (both student and admin sides), notes CRUD, milestone catalog CRUD, milestone assignment and approval — plus `src/lib/student/queries.ts` (the entire student-facing data-access layer) and `src/lib/student-recordings.ts` (the storage helper) directly.

## 13. Known incomplete work

Verified directly from code, not carried over from any prior version of this file or from
`docs/DECISIONS.md`. **Read this section before describing anything in §1 or §7 as "done" — several
student-dashboard pieces are real, tested, and still invisible or one-directional in ways that matter.**

1. **No percentage is shown to any student today.** `PERCENT_READY` (`src/lib/level-readiness.ts`) gates
   the entire progress-percentage feature and reads `{ BEGINNER: false, INTERMEDIATE: false, ADVANCED:
   false }` — checked directly, all three `false`. Every student, at every level, sees "In Progress" text,
   never a percentage or a progress bar, regardless of how much of their frozen effective set they've
   actually achieved. The percentage computation (`getMyLevelProgress`) and the frozen-denominator
   mechanism it depends on are both real and tested (§4, `Milestone.effectiveFrom`) — they're just not
   switched on for any level yet. "Progress is implemented" without this line is misleading: no bar
   appears to anyone right now.
2. **Milestone approval is strictly one-directional — no student self-nomination exists.** Checked every
   student-facing write function in `src/lib/student/queries.ts`: none of them create or update a
   `StudentMilestone` row. `StudentMilestoneStatus.SUBMITTED` is a defined enum value with **zero code
   paths that ever set it** — the only write is the admin approve route
   (`PATCH /api/admin/students/[studentId]/milestones/[studentMilestoneId]`), which sets `ACHIEVED` with
   `signedOffById` taken from the admin session, never from client input. This is a deliberate design
   decision (recorded in `docs/DECISIONS.md`), not an in-progress feature — no notes field on
   `StudentMilestone` either, for the same reason.
3. **`levelEnteredAt` does not exist anywhere in this repository.** Checked `prisma/schema.prisma`,
   every file under `src/`, and `docs/` — zero matches. `StudentProfile` has no persisted "entered this
   level at" field of any name. The actual mechanism: a student's per-level baseline is *derived*, at read
   time, as the earliest `StudentMilestone.assignedAt` among their own rows at their current level
   (`getMyLevelProgress`, `src/lib/student/queries.ts`) — never stored. This is deliberate: it means a
   level change needs no reset logic anywhere, because nothing about "when this level started" is ever
   written down to begin with.
4. **Teacher feedback authoring and a review queue do not exist**, even though the student-facing half of
   this does. `WeeklyPractice.adminFeedback`/`feedbackStatus`/`feedbackAt` are selected and rendered on the
   student dashboard (confirmed — `src/app/student/dashboard/page.tsx` renders all three when present), but
   **no admin route or form ever writes any of them** — checked directly, zero matches for either field
   name anywhere under `src/app/api/admin`. The admin weekly-practice edit route's own settable-status list
   (`WEEKLY_PRACTICE_ADMIN_STATUSES`) is `["NOT_STARTED", "IN_PROGRESS", "MISSED"]` — `SUBMITTED`,
   `REVIEWED`, and `COMPLETED` are not admin-settable through it at all. No review-queue page exists
   anywhere under `/admin` (checked). A student can submit work today and has no way to receive a
   teacher's response through the platform. The code's own comment on the dashboard page names this
   directly: *"nothing currently writes adminFeedback/feedbackStatus/feedbackAt... that's Stage 9, teacher
   review — not built yet."*
5. **`TeacherPrivateNote` has no route or UI anywhere** — the model and its leak-protection are real and
   tested (nothing can reach it from a student session), but a teacher currently has no way to write one at
   all (§4).
6. **"Continue Where You Left Off," session history, and inactivity flagging do not exist under any name.**
   Checked directly (grepped for each) — zero matches anywhere in `src/`. Some of the same underlying data
   (current assignment, latest feedback, notes, progress) is already visible in one place on the student
   dashboard and on the admin per-student page, just not composed into dedicated views for either of these.
7. **The two new admin weekly-practice routes have no test coverage** (§12) — `POST
   .../weekly-practice` and `PATCH .../weekly-practice/[weeklyPracticeId]`, unlike their sibling routes on
   the same surface (notes, milestones, recording playback), which all do.
8. **Student file attachments were schema-only in the prior version of this file — no longer true.**
   `WeeklyPracticeAttachment` is now live: student recording upload writes it, admin and student playback
   both read it (§4, §9). `MonthlyLogAttachment` remains schema-only, unchanged.
9. **Contact and newsletter emails bypass the result-inspection hardening** entirely (§10) — they call `resend.emails.send()` directly and don't check the returned `{data, error}`.
10. **97 Amharic message keys remain untranslated**, `[AM]`-prefixed — 52 of them student-facing
    (`studentDashboard` plus most of `validation`), so a student using Amharic sees the prefix throughout
    their own dashboard today, not only in storefront text (§11).
11. **`SUPABASE_STUDENT_FILES_BUCKET` is UNVERIFIED in Vercel** — set locally, unknown remotely; a real,
    previously-hit failure mode if it's missing there (§8).
12. **`temp/debug-env` branch** — no local ref and no remote-tracking ref exist as of this writing
    (`git branch -a` shows neither locally nor under `remotes/origin/`), which is closer to "appears gone"
    than the prior version of this file's phrasing, but `git branch -a` reflects the last fetch, not live
    remote state — still not fully verifiable from here. Left as UNVERIFIED-but-improved rather than
    claimed resolved.
13. **`mark-not-found` has no `CANCELLED` guard, unlike `mark-paid`.** Verified directly in [src/app/api/admin/orders/[orderNumber]/mark-not-found/route.ts](<../src/app/api/admin/orders/[orderNumber]/mark-not-found/route.ts>) — it checks only `PAID`. Deliberate, not a bug: marking a cancelled order's payment as "not found" moves no money and changes no total. Recorded in `docs/DECISIONS.md`'s 2026-08-10 entry.
14. **Test coverage gaps remain** — see §12 for the current list of what's untested.

## 14. Known constraints

- **`prisma migrate dev` must never be run against this database.** Its seed step calls `prisma.product.deleteMany()` unconditionally ([prisma/seed.ts:64](../prisma/seed.ts#L64)), which would delete every real product row. This project uses diff-and-deploy migrations (`prisma migrate deploy`, hand-written migration SQL) exclusively.
- **`npm run build` cannot be run from this local machine.** It runs `prisma migrate deploy`, which fails with Prisma error P1001 (cannot reach the Supabase connection pooler) — a network limitation of this machine, not a code defect. Build verification happens via Vercel Preview deployments instead.
- **Admin auth and Supabase Auth are fully independent** (§6) — a change to one must never be assumed to affect the other.
- **RLS is enabled with zero policies** on 22 tables (§4) as defense-in-depth against a hypothetical future PostgREST exposure; it does not, and is not intended to, enforce any of this application's actual authorization logic — that lives entirely in `src/lib/admin/dal.ts` and `src/lib/student/dal.ts`.
- **Vercel rejects request bodies over roughly 4.5MB before a Route Handler even runs** — below this app's own 8MB-per-file check in [src/lib/public-image-upload.ts](../src/lib/public-image-upload.ts), so a request carrying multiple images near that size can fail with a non-JSON response before any of this app's own validation or error handling ever executes (see `docs/DECISIONS.md`'s 2026-08-11 entry). The admin product-images flow accounts for this by appending one save at a time rather than batching a full gallery into one request; any other multi-file upload path added later needs the same awareness.
- **Admin forms supporting both "add" and "edit" on the same page must give every field id a per-instance-unique prefix (`useId()`), never a hardcoded string.** `ProductForm` and `AnnouncementForm` both render an always-mounted "add" instance alongside a conditionally-mounted "edit" instance per row — a hardcoded `id` collides across them, and `label[for]` resolves to the first match in the document, silently misdirecting interaction with the second instance. See `docs/DECISIONS.md`'s 2026-08-11 entry.
- **`SUPABASE_STUDENT_FILES_BUCKET` must be set in every environment separately.** `.env.local` is
  git-ignored, so setting it locally has no effect on Vercel Preview/Production — each is configured
  independently. Its fallback (`"student-files"`) is a bucket that does not exist; the real bucket is
  `student-recordings`. A missing value in any environment produces the same generic "Failed to prepare
  upload" error on the first recording-upload attempt there, with no more specific diagnostic (§8, §13.11).
- **`npm run lint` and `npm run test` do not type-check, so `npm run typecheck` (`tsc --noEmit`) must be run before every push.** `eslint` has no type-aware rules configured; `vitest` transpiles via esbuild and never type-checks, by design. `next build` is the only command that runs `tsc`, and it's banned on this machine (P1001) — before `typecheck` existed, that was a real blind spot, not a hypothetical one: four consecutive production builds (`9673dd6` through `bbb084f`) failed on Vercel for exactly this reason. See `docs/DECISIONS.md`'s 2026-08-11 entry ("Four failed production builds"). Caveat: `typecheck` is only accurate if `node_modules/@prisma/client` is current — run `npx prisma generate` (also offline-safe, no DB connection) after any schema change, first.
