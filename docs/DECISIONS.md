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

---

## 2026-08-10 — Order and payment test coverage: what is covered, what is not, and the conventions established

**What was covered.** 171 tests, 22 files, up from 110 at the start of this phase:
- `src/lib/orders.ts` — `createManualOrder` and `createCustomOrder`.
- `POST /api/orders` and `POST /api/custom-orders`.
- `POST /api/orders/[orderNumber]/confirm-payment`.
- `mark-paid`, `mark-not-found`, `quote`, `quote/resend`.

**Bugs found and fixed during this phase.**
- `mark-paid` and `mark-not-found` accepted `PENDING_QUOTE` orders server-side (commit `1a42e59`) — see
  the correction entry above.
- `confirm-payment` had the same gap (this commit).

**Conventions established.** Recorded so the next test file does not invent a second approach.
1. Prisma is always a mocked `@/lib/db` module. Hand-roll only the model/method pairs the route actually
   calls. A real client is impossible here — P1001 means no DB is reachable from the dev machine.
2. `$transaction` is mocked in array form as `vi.fn((ops) => Promise.all(ops))`. This proves both
   statements ran with the expected args; it does NOT test transactional atomicity, which no test on this
   machine can.
3. `next-intl` is mocked lightly for route tests — an identity translator (`key => key`) and `getLocale`
   returning `"en"`. Validation assertions therefore check raw i18n keys, not translated prose. The
   heavier mock in `notifications/index.test.ts` exists only because that file specifically tests locale
   threading.
4. Whether to full-mock `@/lib/orders` depends on whether `@/lib/db` is already mocked in that file. If
   it is, the real `orders` module is safe to import — `vi.mock` intercepts `db` for every importer. If
   it is not, `@/lib/orders` must be fully mocked, because importing it constructs a live `PrismaClient`
   at module load.

**What is deliberately not covered.** Stated plainly so 171 tests are not mistaken for broad coverage.
- `cancel`, `note`, and `screenshot` routes — CRUD with auth checks, judged lower value.
- Every React component — zero `.test.tsx` files exist in the repo.
- `src/proxy.ts` routing, redirect, and cookie-refresh logic.
- `rate-limit.ts`, `order-number.ts`, `pricing.ts`, `payment-screenshots.ts`, `public-image-upload.ts`.
- Admin product and announcement CRUD routes.
- Real transactional atomicity, per convention 2.

---

## 2026-08-10 — Custom Made reference-photo upload shipped (Phase 3)

**Built in six reviewable pieces:** storage helper, admin signed-URL route, admin page rendering, the
route change itself, the client, and the soft-fail notice.

**Verified live on Production** with order `ABK-20260810-6XSFL`: photo uploaded, the admin link opened the
signed URL, the PNG rendered.

**Decision — ordering.** File type and size are validated BEFORE the order is created; the upload itself
runs AFTER. The storage path is `orders/{orderId}/...`, so the upload needs a real order id, but a bad
file must not create an order. Validating first avoids create-then-delete entirely.

**Rejected — an `imagePath` parameter on `createCustomOrder`.** It would have been structurally
always-null from its only caller, implying a write path that cannot exist and misleading the next reader
about where `customOrderImagePath` actually gets written. `attachCustomOrderImage` is the sole writer.

**Decision — the failure split, and why it differs from `confirm-payment`.** A bad file 400s (the
customer's problem, immediately fixable). Any other upload failure soft-fails, with the order intact (our
problem — losing a required description over an optional photo is disproportionate). `confirm-payment`
hard-fails on the equivalent case because the screenshot there IS the evidence being verified — there is
no "the important part already succeeded" fallback to lean on.

**Decision — the attach-failed signal rides a query param, not a schema column.** It needs to survive one
navigation, not become a durable order attribute; the durable channel for "we didn't get your photo" is
the confirmation email's own instruction to reply.

**Decision — the component keeps its own local type/size constants** rather than importing them from
`custom-order-images.ts`, because that module imports `supabaseAdmin`, which reads
`SUPABASE_SERVICE_ROLE_KEY` at module scope with no `import "server-only"` guard. Not worth gambling a
service-role key on bundler behaviour to save one duplicated pair of constants.

**Found, not fixed — `src/lib/supabase-admin.ts` has no `import "server-only"` guard.** An accidental
client-side import would not fail the build loudly. Standing gap, worth a small follow-up.

**Found and fixed — the custom order description was invisible after quoting.** It previously rendered
only inside `QuoteForm`, which disappears once `paymentStatus` moves past `PENDING_QUOTE` — an admin could
no longer see what the customer asked for while building the instrument. Fixed in piece 3 by gating a new,
always-visible block on the description existing, not on `paymentStatus`.

**Manual setup done.** The private `custom-order-images` bucket was created in Supabase.
`SUPABASE_CUSTOM_ORDER_IMAGES_BUCKET` is unset and falls back to that literal name.

---

## 2026-08-10 — `server-only` guards, and a test that mocked the wrong boundary

**Decision.** Added `import "server-only";` to five modules: `supabase-admin.ts` and the four libs that
wrap it (`supabase-admin-auth.ts`, `payment-screenshots.ts`, `custom-order-images.ts`,
`public-image-upload.ts`).

**Rejected — guarding only `supabase-admin.ts`.** The transitive guard would still catch the mistake, but
the build error would point two hops away from the file the developer actually touched. Each of the four
wrappers also contains its own server-only logic rather than being a pure passthrough.

**Sequencing.** The `server-only` package had to be installed first. Adding the import before installing
would have turned a silent gap into a hard Vercel build failure with "Cannot find module," and local
`npm run build` cannot catch that here (P1001).

**What it revealed — the reusable part.** Adding the guard immediately broke
`src/app/api/admin/students/route.test.ts`. Root cause: that test mocked `@/lib/supabase-admin`, but the
route imports `@/lib/supabase-admin-auth` — one level up. The test had always been exercising a different
boundary than the route uses. It passed anyway, and would have kept passing indefinitely. The guard
exposed it only because a module-level side effect runs for real when the file itself is not mocked.
Fixed by mocking at the boundary the route actually imports, matching what `forgot-password/route.test.ts`
already did correctly. Two cleanup tests merged into one: `deleteSupabaseUser` is void and swallows its
own errors by design, so once mocked at the correct boundary the route cannot distinguish the two cases.
Keeping both would have meant one passing for the wrong reason. Test count 175 → 174.

**Pattern worth naming.** This is the third instance in two days of something reading stronger than it
enforced: `mark-paid`'s guard existed only in the UI; the quote route's region-pairing branch is
unreachable through its own schema; and now a test asserting against a boundary the code does not use. In
each case the code looked correct and the failure was invisible until something forced it into the open.
General rule: when verifying a protection, check what the code actually imports and what input can
actually reach it — not what the names imply.

**Verification.** `npm run test` cannot prove these guards resolve correctly — `server-only` throws under
plain Node regardless of context, and every test in this chain mocks the modules. The real check was a
successful Vercel build on `main`, which passed.

---

## 2026-08-11 — Admin notifications go to two recipients by email; Twilio deferred

**Decision.** Both administrators now receive admin notifications via Resend, configured through
`ADMIN_NOTIFICATION_EMAILS` as a comma-separated list. Verified live: new-order and cancellation emails
reached both addresses.

**Rejected, for now — Twilio SMS and WhatsApp.** The code exists and is inert behind
`TWILIO_NOTIFICATIONS_ENABLED=false`. Deferred because WhatsApp beyond the sandbox needs a Meta Business
account and template approval, and SMS to US numbers needs A2P 10DLC registration — days of waiting and a
paid account, for a channel email already covers.

**Two gaps found and fixed while verifying.** `adminEmailRecipients` did not deduplicate, so a repeated
address in the env var sent the same person the same email twice. No admin notification fired when a
quote was sent or resent, even though `cancel` and `mark-paid` both notify the whole list for
admin-triggered actions.

**Test gap closed.** `adminEmailRecipients` had no direct test coverage at all despite being the single
point of failure for every admin notification. Now covered: multiple addresses, whitespace, trailing
commas, exact and case-differing duplicates, and unset.

---

## 2026-08-11 — Product image management: duplicate form ids, request size limits, and append-not-replace

**What was broken.** Multi-file selection failed on the admin EDIT product form but worked on the ADD
form. Uploading images on edit appeared to succeed while changing nothing.

**Root cause 1 — duplicate DOM ids.** The add form is always mounted on `/admin/products`, and clicking
Edit on a row mounts a second `ProductForm` without unmounting the first. Every field used a hardcoded id,
so two elements shared `id="images"`. `label[for]` resolves to the FIRST match in document order, so
interacting with the edit form's fields activated the add form's elements instead. Files selected there
never reached the submitted form, which then correctly saved with zero new images. Fixed with one
`useId()` prefix per component instance, in both `ProductForm` and `AnnouncementForm`.

Worth noting: three separate investigation passes found nothing wrong with the file input, because
nothing was wrong with it. The `multiple` attribute was present and reached the DOM. The route used
`getAll` correctly. The failure was in how the browser resolved a correct attribute across two correct
copies of a correct form.

**Root cause 2 — Vercel request body limit.** Three photos totalling 6MB failed with a generic "Something
went wrong." The app validates 8MB PER FILE, but Vercel rejects request bodies over roughly 4.5MB before
the route runs at all — producing a non-JSON response, so the client's `res.json()` threw and fell into
the hardcoded generic catch. The real reason existed only in server logs.

**Decision — append, not replace.** Product images now append rather than replace. Adding photos never
deletes existing ones as a side effect. Photos are added one or two at a time, which also keeps each
request well under the platform limit.

**Decision — deletion is its own action.** `DELETE /api/admin/products/[id]/images`. The DB write happens
BEFORE the storage delete, so a storage failure leaves a harmless orphaned file rather than a product
referencing an image that no longer exists.

**Decision — show existing photos.** The edit form now shows existing photos as thumbnails. Previously
there was no way to see what a product already had.

**Decision — surface real errors, clean up orphans.** Upload failures now return a specific JSON error
instead of re-throwing into a non-JSON 500, and orphaned uploads are cleaned up on all three failure
paths: the upload loop, the custom-made image, and the final DB write.

**Pattern — fourth instance.** Adding to the running list: `mark-paid`'s guard existed only in the UI; the
quote route's region-pairing branch is unreachable through its own schema; a test asserted against a
boundary the code does not use; and now correct markup failing because it was rendered twice. Each time
the code read correctly in isolation. General rule extended: also check what else is on the page.
