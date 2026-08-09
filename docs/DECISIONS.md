# Decisions Log

---

## 2026-08-08 — Production email and DNS recovery

**Context.** `RESEND_API_KEY` existed as a variable name in Vercel, but its Production value was blank
(length 0). Discovered via a temporary admin-only diagnostic route that reported env var presence and
length only, never values. Separately, `abelkirar.com` was not resolving at all.

**Impact while the key was blank.** These failed silently: customer order confirmations, admin new-order
notifications, payment-confirmed emails, student invitation emails.

**Why it was silent.** `sendEmail` does check the Resend error object, but the order routes do not
re-inspect the result `sendEmail` returns. An order could save correctly while nobody was told.

**Decision — RESEND_API_KEY.** A new Production key was created in Resend (Sending access) and set in
Vercel scoped to Production. The pre-existing "Onboarding" key was left in place.

**Verified.** The diagnostic re-reported the variable as non-blank, and a test order triggered an email
that Resend reported as Delivered.

**Vercel behaviour to note.** Changing a Production environment variable has no effect until a new
Production deployment is created. Redeploy with "Use existing Build Cache" unchecked.

**Context — DNS.** Nameservers point to Cloudflare, so DNS is managed there and not at the registrar.
Before this, Cloudflare held only three Resend email records; nothing pointed at the site.

**Decision — DNS.** Two records were added:

| Type  | Name | Target                                | Proxy    | TTL  |
|-------|------|----------------------------------------|----------|------|
| CNAME | @    | acfbffd69dcfc20d.vercel-dns-017.com   | DNS only | Auto |
| CNAME | www  | acfbffd69dcfc20d.vercel-dns-017.com   | DNS only | Auto |

Proxy status must be "DNS only" (grey cloud) — Cloudflare defaults new records to Proxied, which breaks
Vercel SSL issuance. The apex CNAME works via Cloudflare CNAME flattening. The three existing Resend
records were deliberately left untouched.

**Verified.** Both domains show Valid Configuration in Vercel and abelkirar.com loads successfully.

**Pending follow-ups.**
1. Implement the Custom Made form submission and notification flow — the component currently has no
   submit handler. **Done — see 2026-08-09 entry.**
2. Review and merge the five commits on feature/student-platform. **Done — see 2026-08-09 entry.**
3. Delete temp/debug-env after confirming the route removal is deployed.

---

## 2026-08-09 — Custom Made quote flow shipped and feature/student-platform merged to main

**Context — Custom Made.** The component previously had no submit handler and silently discarded every
custom instrument request.

**Decision — quote-first flow.** Built as a quote-first flow, deliberately not a purchase: the customer
submits a description, an Order is created at PaymentStatus.PENDING_QUOTE with subtotal/total 0 as a
placeholder, no price and no payment instructions are shown, and an admin sets the real price later.

**Rejected — charge the listed base price up front.** A custom instrument's price depends on wood, shape,
tuning and decoration, so asking a customer for more money after they had already paid was judged worse
than making them wait 1–2 business days for a quote.

**Rejected — nullable subtotal/total columns.** Kept `NOT NULL` with 0 as a sentinel, defended by
branching on `paymentStatus` BEFORE reading `total` on every surface (customer confirmation page, admin
list, admin detail). Recorded as an accepted risk: no code may ever treat `total === 0` as a real price.

**Rejected — fixed notification-status columns on Order.** Chose the `OrderNotificationLog` child table
instead, because an order sends several distinct emails over its lifetime and fixed columns would be
overwritten by whichever sent last, losing both the history and the ability to tell which email failed.
The table exists but nothing writes to it yet.

**Decision — resend gated on quotedAt.** Added `POST /quote` and `POST /quote/resend`. The resend route
is gated on `quotedAt` rather than `paymentStatus`, because by the time it's needed, `paymentStatus` has
already moved past `PENDING_QUOTE` — gating on status would have made a failed quote email a permanent
dead end with no way to tell the customer their price.

**Decision — hide unsafe actions.** Mark-as-paid and mark-payment-not-found are hidden while
`PENDING_QUOTE`, closing a hole where clicking them would have produced a `PAID` order with a zero total.

**Verified.** Verified on Preview with real order ABK-20260808-F5539: submission, both emails, a $200
Zelle quote with correct live payment instructions, and a successful resend.

**Context — notification hardening (commits 6ed5e82, 8097b91).** `sendToAdminEmails` returned
`{ sent: true }` when `ADMIN_NOTIFICATION_EMAILS` was empty — reporting "nobody configured" as
"delivered."

**Decision — notification hardening.** Fixed. Six routes relied on try/catch alone while `sendEmail`
resolves with `{ sent: false }` rather than throwing, so failures were invisible. All six now inspect the
result. Notification failures still never roll back a saved order. A regression test now pins the
empty-recipients case.

**Honest limitation.** This only improves logging, and logs are not somewhere anyone actually looks.
`OrderNotificationLog` plus a badge on `/admin/orders` is the real fix and is not built yet.

**Decision — merge to main.** Clean fast-forward, `571edf1..a575c1a`, zero conflicts, 90 files. `main`
had been stale since late July — that staleness is what caused the confusion during the 2026-08-08
session. All six new migrations verified additive: no `DROP`, no `NOT NULL` added to an existing column,
no enum removals, no `DELETE` or `TRUNCATE`.

**Near-miss — debug-env route.** The temporary debug-env route was deleted on `temp/debug-env` only,
never on `feature/student-platform`. Merging as-is would have silently reintroduced a diagnostic
env-inspection endpoint to Production. Caught by a pre-merge dry run and deleted first.

**Near-miss — missing NEXT_PUBLIC_SUPABASE_ANON_KEY.** Missing from Vercel entirely. Because
`NEXT_PUBLIC_` variables are inlined into the client bundle at build time, a missing value bakes in as
`undefined` for every visitor — nothing throws, nothing logs, the feature is just dead. Added to
Production and Preview before merging. General rule: audit new `NEXT_PUBLIC_` vars before any merge that
ships client-side code, because this class of failure is invisible at runtime.

**Not a bug — home page instrument cards.** The home page instrument cards (Kirar/Begena/Masenqo) render
as CSS gradient blocks with no photos. Confirmed this is the original design: `InstrumentCategoryCards`
has never contained an `Image` element, going back to the initial scaffold commit. RLS was ruled out as a
cause — product images live in a public Supabase Storage bucket served by unauthenticated GET, sharing no
mechanism with the RLS migration, which only touched tables in the public Postgres schema. `/store`
confirmed serving real photos correctly.

**Still open.**
1. 37 Amharic keys from Phases 2 and 4 untranslated, plus 4 pre-existing untranslated keys in `cart.*`
   that predate this work. All marked with an `[AM]` prefix in `messages/am.json`.
2. Phase 3, the customer reference-photo upload, not built. Optional.
3. `OrderNotificationLog` has no writer and no admin badge.
4. Delete the temp/debug-env branch, local and remote.
5. `docs/PROJECT_STATE.md` has never been created, so the externalised-state layer of the durability
   system does not exist.

---

## 2026-08-10 — Correction: mark-paid and mark-not-found were never actually guarded

**Correction to the 2026-08-09 entry.** That entry states that hiding the Mark-as-paid and
Mark-payment-not-found buttons while `PENDING_QUOTE` "closed a hole where clicking them would have
produced a `PAID` order with a zero total." That was wrong. This entry does not edit the original —
the record of what was believed at the time has value — it corrects it here.

**What was actually true.** The guard existed only in `order-actions.tsx`, a client component. Both API
routes accepted the POST regardless of `paymentStatus`. An authenticated admin could produce a `PAID`
order with `total` 0 via a direct request — the precise outcome the 2026-08-09 entry claimed was
prevented, and a violation of that same entry's stated invariant that no code may treat `total === 0` as
a real price.

**What was already correct.** `/quote` had the correct server-side guard from the start (409 when
`paymentStatus` is not `PENDING_QUOTE`). The pattern existed in the codebase; it simply was not applied
to the other two routes.

**Decision — fix.** Both routes now 409 before any other check, matching `quote/route.ts`.

**Severity.** Required an authenticated admin session, so this was never externally exposed. The problem
was the false confidence in the log, not the exposure.

**General rule.** Hiding a control in the UI is not a guard. Any invariant that matters must be enforced
server-side, and a decision-log entry claiming a hole is closed should name where the check actually
lives.

**Still open.** `POST /api/orders/[orderNumber]/confirm-payment` has no `PENDING_QUOTE` check either. It
writes a `PaymentConfirmation` row and emails the admin a $0.00 notification, but never changes order
status — data hygiene rather than money correctness. Deliberately deferred to the Tier 4 test work.

---

## 2026-08-10 — Guards examined during test coverage: three that read stronger than they are

**Context.** While writing Tier 1 and Tier 2 order tests, three places turned up where the code's
apparent intent and its actual enforcement diverge. None is a bug. All are recorded because the mark-paid
incident earlier today was the same shape, and the next person to read this code will make the same
assumption already made once.

**1. `mark-not-found` has no CANCELLED guard.** `mark-paid` checks `status === "CANCELLED"` and 409s;
`mark-not-found` does not. Marking a cancelled order's payment as not-found moves no money and changes no
total, so this was left alone deliberately rather than fixed. No test claims coverage of a guard that
isn't there.

**2. `createManualOrder` has no internal quantity bound.** The `max(10)` cap lives in
`checkoutItemSchema` at the API route boundary, and there is exactly one caller, which validates first.
The function multiplies by whatever quantity it receives. A test documents this trust boundary rather
than asserting a defense that doesn't exist inside the function.

**3. The quote route's region-pairing guard has an unreachable branch.** `quoteSchema` accepts only
`ZELLE` and `CASH_APP`, so a schema-valid method that is wrong for the order's region cannot be
constructed. The "wrong method for US" branch is dead code, reachable only if the schema widens. The
reachable branch is the omitted-method case, and that is what the test covers.

**General rule.** When writing a test for a guard, confirm the guard exists and that the input can
actually reach it. A test that passes for the wrong reason is worse than no test, because it converts an
unknown into false confidence.
