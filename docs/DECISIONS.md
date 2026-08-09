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
