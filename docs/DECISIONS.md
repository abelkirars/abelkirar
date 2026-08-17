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

---

## 2026-08-11 — Four failed production builds — no type checking between editor and Vercel

**What happened.** Commits `9673dd6` through `bbb084f` all failed to build on Vercel. Production stayed on
`74e1dc7` for roughly a day while five commits stacked up unnoticed, including the entire customization
backend and admin editor.

**Root cause — a structural gap, not a mistake.** Three type errors: two Prisma `JsonValue` casts that
needed to go through `unknown`, and a test mock spreading `unknown[]` into a single-parameter `vi.fn`.

None of the three could be caught locally:
- `eslint` does not type-check; no type-aware rules are configured.
- `vitest` transpiles via esbuild and never type-checks, by design.
- `next build` DOES run `tsc`, but it is banned on this machine because `prisma migrate deploy` fails with
  P1001.

So the only check that would have caught these was the one that cannot run here. The local loop had a
blind spot, not a false negative.

**Fix.** Added `"typecheck": "tsc --noEmit"` to `package.json`. Needs no database connection. Run it
before every push.

**Caveat that caused real confusion during diagnosis.** `node_modules/@prisma/client` can go stale after a
schema change, producing dozens of phantom errors about columns that do exist. `prisma generate` is also
offline-safe, so the routine after any schema change is `prisma generate`, then `typecheck`. Vercel
regenerates on every build, so those errors are local-only.

**Side note.** `src/generated/prisma` is a gitignored orphan from July 14 that nothing imports.

---

## 2026-08-12 — Product customization options: admin editor, image-select, and the order-time snapshot

**What shipped, in six pieces**, each built and verified independently (lint/test/typecheck green at every
step):
1. Migration `20260811160000_add_order_item_customization_snapshot` — additive-only
   `OrderItem.selectedCustomizationSnapshot Json?`, schema first, nothing reading or writing it yet.
2. Types (`src/types/customization.ts`) and a zod schema
   (`src/lib/validations/customization-options.ts`) for the field/choice array, including the new
   `image-select` field type.
3. Two admin routes: `PATCH /api/admin/products/[id]/customization-options` (whole-array replace, with
   orphan choice-image cleanup diffed against the old array) and `POST
   /api/admin/products/[id]/customization-choice-image` (uploads one choice image ahead of save).
4. The nested admin editor — `CustomizationOptionsEditor` / `CustomizationFieldEditor` /
   `CustomizationChoiceEditor` (`src/components/admin/`), a dedicated page at
   `/admin/(authenticated)/products/[id]/customization`, entered via a new "Customize" link on each
   product row.
5. The `image-select` rendering branch in `CustomizationForm` (customer-facing) — a tappable photo grid,
   matching `ProductGallery`'s selection-ring language rather than `select`'s bordered-button or
   `swatch`'s color-ring, since it's structurally a photo grid, not a color picker.
6. The order-time snapshot: `buildCustomizationSnapshot()` in `src/lib/orders.ts:26-66`, called from
   `createManualOrder`, and rendered on the admin order detail page in place of raw ids when present.

**Decision — ids are slugified from the label and frozen, not regenerated.** `src/lib/customization-id.ts`:
`freezeId()` computes an id from a field/choice's label the first time it has one (on blur, not on every
keystroke, so it isn't locked in from the first character before someone finishes typing) and never
touches it again — later label edits never change the id. Reason: the id is the join key for
`computeUnitPrice`, the raw `selectedCustomization` map, and now `selectedCustomizationSnapshot` — letting
it drift with a label edit would silently break pricing and historical order data. Collisions (two choices
both slugifying to the same string) get a numeric suffix (`natural`, `natural-2`, ...), scoped to siblings
only — two different fields may reuse the same choice id, since fields are independent id namespaces
(confirmed against `customizationOptionsSchema`'s own uniqueness check, which is per-field for choices and
array-wide for fields).

**Decision — the snapshot resolves against the product's options AT ORDER TIME, forever.**
`buildCustomizationSnapshot()` runs once, inside `createManualOrder`, reading whatever
`Product.customizationOptions` says *right then* — never re-run later. Renaming a field or choice, or
deleting a choice, after the order exists cannot change what that order's snapshot says the customer chose
or what it cost, because nothing ever re-resolves it. This is the exact case flagged as a future risk in
the 2026-08-10 entry ("would go silently wrong the moment that editing UI exists") — that editing UI now
exists (piece 4), which is why this piece was never optional. Text fields are included in the snapshot
despite having no predefined choice: `choiceLabel` holds the customer's typed value itself (e.g. the
engraving text), `priceModifier` is always 0 (matching `computeUnitPrice`, which already skips `"text"`
fields), no `imageUrl`. Omitting text fields would have left the exact problem unsolved for the one field
type where the value *is* the content someone needs to actually build the instrument.

**Decision — picking a design swaps the main product image; last-touched-wins is a side effect of shared
state, not a rule.** `ProductGallery` and `CustomizationForm` are independent client components with no
shared ancestor holding state; `ProductDisplay` (`src/components/store/product-display.tsx`) was
introduced as a thin composing wrapper that owns one `selectedImage` `useState` and passes it into both —
`ProductGallery` as a controlled `selectedImage`/`onSelectImage` pair (falling back to fully self-contained
behavior when neither prop is passed, so it's still usable standalone), `CustomizationForm` as a plain
`onSelectImage` callback fired when an image-select choice is tapped. Because both a gallery-thumbnail tap
and a design-choice tap call the exact same setter, whichever happened most recently is simply what's in
state — no priority flag, no locking logic; "last touched wins" falls out of using one shared setter
rather than being implemented as a rule.

**Three cases where the obvious implementation would have been wrong:**
1. **Native `required` does nothing here.** The editor's Save button is a JS `onClick` handler, not a form
   submit event, so HTML5 `required` never blocks anything on its own — and even if it were a real form,
   `@base-ui/react/accordion`'s `AccordionRoot` defaults to `keepMounted: false`, so a *collapsed* field's
   `required` input isn't even in the DOM to be validated. The actual guard is a friendly pre-check inside
   `handleSave` (`customization-options-editor.tsx:134-143`) that blocks on an empty label before ever
   reaching zod — which also avoids surfacing zod's own "Field id is required" message, meaningless to an
   admin who never typed an "id".
2. **A button cannot nest inside `AccordionTrigger`.** `AccordionTrigger` itself renders as a `<button>`;
   move/remove controls for a field live inside `AccordionContent` instead (only reachable while
   expanded) rather than beside the trigger, to avoid invalid nested-button HTML.
3. **`Number("") === 0`, not `NaN`.** The price-adjustment input's first draft recomputed `priceModifier`
   on every keystroke; clearing the field to retype a value would have silently zeroed a real price
   adjustment — a money bug that wouldn't announce itself until an order total was wrong weeks later.
   Fixed in `customization-choice-editor.tsx` (`handlePriceChange`/`handlePriceBlur`): the input's own
   string is the source of truth while typing, only a non-empty, finite-parsing value ever commits to
   `priceModifier`, and blur resets the display to the last committed value if what's left isn't valid.

**Decision — store search.** `/store` gained a `?q=` param, filtering `name`/`variantName`/`description`
case-insensitively via Prisma's `contains` + `mode: "insensitive"` (GA on `postgresql`, no preview flag —
confirmed against `schema.prisma`'s `generator client` block, which enables no preview features at all).
Query lives in the URL, a plain `<form action="/store">` (default GET) — no client component, no JS needed
for the search itself. **Category and search are mutually exclusive, not ANDed.** The first version
composed them, which meant browsing a category and then searching for something outside it silently
returned zero results with no indication a category filter was still narrowing the query. Fixed by
computing `categoryFilter` as `undefined` whenever a search is active — not just by dropping the category
param from the search form (which only fixes the form path), but at the point both filters are read,
which also closes the same trap for a bookmarked or manually-edited URL carrying both params.

---

## 2026-08-12 — Unrecognised customization field types rendered nothing — and silently pre-selected a choice

**What was found.** A product's "Shape" field showed its label and an empty space on the store page, while
"Size" on the same product rendered fine. The choices were present and correct in the admin editor.

**Root cause.** `CustomizationForm` branches on `field.type` with four independent exact-match `if` blocks
and no default case, so a type string matching none of them renders the label and nothing else. The admin
editor's own gate is `showsChoices = field.type !== "text"` — permissive — so the same field looks
completely normal there. Both read identical stored JSON; the asymmetry is entirely in how each decides
what counts as having choices.

**The part that matters more than the blank render.** The default-selection logic pre-selects `choices[0]`
for any non-text field. So a customer would silently order the first choice, having never seen a picker or
made a decision. That is worse than a visibly broken field — it produces a wrong order that looks like a
correct one.

**Fix.** `CustomizationForm` now falls back to plain select-style buttons for any unrecognised type that
has choices, and warns to the console naming the product, field, and type. `KNOWN_FIELD_TYPES` is
deliberately untyped — annotating it as `CustomizationFieldType[]` would let TypeScript narrow the fallback
branch away, defeating a runtime check against arbitrary stored JSON.

**Checked and NOT changed.** Every other branch on `field.type` (`pricing.ts`, `buildCustomizationSnapshot`,
`missingRequired`, `summarize`) special-cases only `"text"` and treats everything else uniformly, so an
unrecognised type already prices, snapshots, and summarises correctly. Rendering was the only place
needing an exact match.

**Deferred, with reasoning.** Tightening the admin editor's permissive check. Naively requiring one of the
three choice-bearing types would hide the choices from an admin trying to repair a broken field — making
recovery harder. Needs its own design pass.

**Residual gap.** A required field with an unrecognised type AND no choices still renders nothing and
blocks add-to-cart permanently, since there is no fallback UI possible with zero choices.

**Pattern — fifth instance.** Adding to the running list: `mark-paid`'s guard existed only in the UI; the
quote route's region-pairing branch is unreachable through its own schema; a test asserted against a
boundary the code does not use; correct markup failed because it was rendered twice; and now two
components reading the same data disagreed about what it meant, because one matched exactly and the other
matched loosely.

---

## 2026-08-15 — Student dashboard MVP: Stages 1–6 verified end to end

**What was built.** Stages 1–6: codebase audit, the data model foundation, the student authorization
layer, admin assignment authoring, the student assignment view, and the practice log.

**Verified by inspection, not only by tests.** A real assignment was authored with deliberately
recognisable markers in all three admin-only fields, then viewed as a logged-in student.
`SECRET-CURRICULUM-123`, `SECRET-TECHNIQUE-123`, and the private rationale were absent from the page
source and from the practice-log POST response. The practice entry saved and listed.

**Why the page source is the whole surface.** The student dashboard has no `"use client"` anywhere in its
tree, so the assignment object is never serialised as props. The HTML document is the only response
carrying assignment data — there is no separate client fetch to inspect. The single student-facing JSON
response in the feature is the practice-log POST, which was checked separately.

**Decisions worth keeping.**
- No DAL function takes a `studentId` parameter; every one reads it from the session, so a route cannot
  pass through a caller-supplied id. Structural, not disciplined.
- Milestone reads go through `StudentMilestone` only, so an unassigned milestone has no row to reach —
  future milestones are hidden by the access pattern, not by a flag someone must remember to set.
- Assignment visibility is `weekStartDate <= now()`, enforced in the query. A future-dated assignment does
  not match; there is no publish flag to forget.
- The practice-log Zod schema is strict, so a body containing `studentProfileId` is rejected with 400
  rather than stripped. A client sending one is told, not given a success response for something that did
  not happen as asked.
- `teacherNotes`, `internalCurriculumRef` and `currentTechnique` share a row the student's own query
  reads. Protection there is an explicit `select`, not structure — noted in the schema so a later stage
  cannot forget.

**Not built, deliberately.** No hard-delete for `StudentProfile`. `PracticeLogEntry` and `StudentNote`
cascade, so a delete button would destroy a student's entire practice history on one misclick, and
re-inviting an existing email already works via upsert on `supabaseUserId`. If removal is ever needed it
should be soft-delete or deactivate-and-reassign-email.

**Operational note.** Invite links use `NEXT_PUBLIC_SITE_URL` as an explicit `redirectTo`, which overrides
Supabase's dashboard Site URL. An invite sent from the dev server therefore points at localhost by design.
Send invites from production.

---

## 2026-08-16 — Stage 8 recording upload: a missing bucket env var, masked by a generic error

**What happened.** The first manual test of recording upload failed with "Failed to prepare upload." A
later attempt succeeded, with no code change and no redeploy triggered by hand.

**Root cause, confirmed.** `SUPABASE_STUDENT_FILES_BUCKET` was unset in `.env.local`, so `RECORDING_BUCKET`
fell back to the literal `"student-files"` — a bucket that doesn't exist; the real one is
`student-recordings`. Confirmed two ways, not inferred: `git diff HEAD` showed zero changes to any
recording-related file since the last commit, and a direct before/after read of `.env.local` showed
`SUPABASE_STUDENT_FILES_BUCKET="student-recordings"` present on the second read, absent on the first.

**The real problem.** The cause was invisible after the fact because the sign-upload route's catch-all
returned one generic message ("Failed to prepare upload") for every unexpected failure, collapsing five
distinguishable outcomes — unauthenticated, assignment not owned, invalid type/size, storage signing
failure, and genuinely unexpected — into one indistinguishable 500. The client itself was not at fault:
it already surfaces whatever message the server sends; there was simply nothing specific for it to
surface. Same shape as the "Something went wrong" masking a real Vercel body-size limit on product image
upload, 2026-08-11: a generic catch turning a specific, diagnosable failure into an unsolvable one.

**Deployment risk — not a footnote.** `.env.local` is git-ignored. This fix exists on one machine. It is
not, and cannot be, in Vercel's Preview or Production environment variables — those are configured
separately and were never touched by this fix. Production and Preview will fail identically the first time
a recording is uploaded there, unless `SUPABASE_STUDENT_FILES_BUCKET` is set in Vercel before that happens.

**Process.** A specific cause — a migration name, an enum value, a claim about client-side error handling —
was asserted from memory rather than checked against the repository, and built into a causal story before
any verification. Caught by checking `git diff` and the actual file contents rather than accepting the
story because it was plausible. Distinct from the "Pattern — Nth instance" list above (guards and code
reading stronger than they enforce, currently at five) — this is the same discipline applied to an
asserted premise rather than to implemented behavior. Recorded as the fourth time it has mattered on this
project.

---

## 2026-08-16 — Current focus is a deliberate exception — and the test mock never implemented orderBy

**Context.** Manual testing showed an unapproved milestone label on the student dashboard. It looked like
a leak. It was not — two separate findings came out of chasing it down.

**Finding 1 — a spec contradiction, not a bug.** The spec asked for "current focus" as student-facing
(§7.G), while the negative tests specified for this stage required that unachieved milestone labels never
reach the student. A current focus IS an unachieved label. Both requirements could not hold at once.

**Decision.** Resolved in favour of showing exactly one — the most recently assigned unachieved milestone.
A student who sees only past achievements has no sense of direction, and one label ahead is a narrow
window: they learn the next thing, not the sequence. `student-dashboard-spec-v1.md` §7.G now states this
explicitly, including that an OLDER still-in-progress milestone superseded by a newer assignment is also
hidden — not only future/unassigned ones.

**Finding 2 — the harness was not testing what it appeared to.** The new test written to prove the
current-focus exception is exactly one label failed on first run, for a reason neither the request nor the
response anticipated. The in-memory `findFirst` mock for `StudentMilestone` never implemented `orderBy` at
all — it returned array insertion order and silently ignored the `orderBy: { assignedAt: "desc" }` the real
query passes. No prior test had two same-student candidates for `getCurrentMilestone`, so nothing about its
ordering had ever actually been verified; every earlier green run proved less than it appeared to.

**Fix — the mock, not the fixture.** `mockFindFirstStudentMilestone` now sorts matches by whatever
`orderBy` clause it is actually given, the same way Prisma would. Reordering the fixture instead would have
made the test pass by fixture-order coincidence rather than by proving the real `orderBy` clause works —
the same wrong-reason failure the test exists to prevent, one layer deeper, and in the test infrastructure
itself rather than in a single test.

**Pattern — sixth and seventh instances.** Six: a spec that stated two requirements which could not both
hold, so an implementation satisfying one looked like it was violating the other. Seven: a test harness
silently ignoring a clause the real code depends on, so every test touching that query proved less than its
name implied.

The running list is now: a guard that existed only in the UI; an unreachable schema branch; a test mocking
the wrong boundary; correct markup rendered twice; two components matching the same data with different
strictness; a self-contradicting spec; and a mock that dropped `orderBy`.

**General rule.** Extends the standing one: verify what the code actually does against what you can see,
not against what the names say. Of these seven, five were found by someone looking carefully at something
that appeared to be working.

---

## 2026-08-17 — Correction: hard delete is back, for test accounts, with guardrails replacing the protection the 2026-08-15 decision provided

**The 2026-08-15 entry said:** *"No hard-delete for `StudentProfile`. `PracticeLogEntry` and `StudentNote`
cascade, so a delete button would destroy a student's entire practice history on one misclick, and
re-inviting an existing email already works via upsert on `supabaseUserId`. If removal is ever needed it
should be soft-delete or deactivate-and-reassign-email."**

**This is not a correction of a mistaken belief** — the reasoning in that entry still holds, and this entry
does not dispute it. It is Abel deliberately overriding it, in full knowledge of what it warned against,
because the actual need turned out to be different from what the decision anticipated: genuinely removing
test accounts and freeing their emails for reuse, not recovering from an admin misclick. Deactivation
(already built) does not free the email — `StudentProfile.email` stays `@unique`-occupied by an inactive
row forever. That gap is what this closes.

**What was verified before building, not assumed.**

1. **Every FK pointing at `StudentProfile`, checked directly against the schema.** Six direct relations,
   all `onDelete: Cascade`: `WeeklyPractice`, `MonthlyLog`, `StudentNote`, `TeacherPrivateNote`,
   `StudentMilestone`, `PracticeLogEntry`. Two more cascade transitively through those:
   `WeeklyPracticeAttachment` (`onDelete: Cascade` from `WeeklyPractice`) and `MonthlyLogAttachment`
   (`onDelete: Cascade` from `MonthlyLog`). `StudentMilestone.milestone` is `onDelete: Restrict`, but in the
   other direction — it stops a *milestone* from being deleted while assignments reference it; it has no
   bearing on deleting a *student*. Net effect: deleting a `StudentProfile` genuinely destroys every
   assignment, submission, recording attachment row, practice log entry, note, private note, and milestone
   record for that student. The `Milestone` catalog itself is untouched.
2. **Storage is real and Postgres cannot see it.** `WeeklyPracticeAttachment.storagePath` points at an
   object in the `student-recordings` bucket (§8/§9 of `docs/PROJECT_STATE.md`). A schema-level cascade
   removes the *row*; the file behind it is never touched by any FK. `deleteRecordingObjectOrThrow`
   (`src/lib/student-recordings.ts`, new) deletes it for real — deliberately not the existing
   `deleteRecordingObject`, which is best-effort and never throws by design for its own call site (cleaning
   up a superseded recording after a new upload already succeeded). This one gates: it must be able to stop
   the whole deletion if it fails, which a swallowed error cannot do. Every attachment's `storagePath` is
   collected *before* anything is deleted — once the database step runs, that list is gone for good.
3. **A Prisma-only delete leaves the Supabase Auth user behind, and the email stays taken at the Auth
   level** — confirmed by reading how invites work (`generateStudentInviteLink`/`findSupabaseUserByEmail`):
   Supabase's own `email_exists` check is what a fresh invite to the same address would hit. A new
   function, `deleteStudentAuthAccount` (`src/lib/supabase-admin-auth.ts`), was added specifically for this
   — **not** the existing `deleteSupabaseUser`, which is best-effort invite-rollback cleanup that never
   throws by design (see its own doc comment). This route needs the opposite contract: it must know whether
   the Auth deletion actually succeeded, so building a second function with a different failure contract was
   the correct call, not duplication of the first.

**Finding, separate from and more important than the delete feature itself: I could not confirm the
foreign-key failure Abel described.** The concern, as raised: deleting a student with recordings currently
fails with a foreign-key error, an unchosen gap. Checked directly, three ways, before writing anything
around it: `WeeklyPracticeAttachment.weeklyPractice` is declared `onDelete: Cascade` in
`prisma/schema.prisma`; the actually-*applied* migration SQL
(`20260728105905_add_student_platform/migration.sql`) declares the same foreign key with the literal SQL
`ON DELETE CASCADE` — schema and applied database agree, this is not a case of the schema saying one thing
and a hand-written migration saying another, which has bitten this project before; and no `relationMode`
override exists in the datasource block, so Postgres's native cascade is what actually runs, not an
emulated one. From source, a plain `prisma.studentProfile.delete()` should cascade through
`WeeklyPracticeAttachment` cleanly. I cannot run this against a live database to prove it empirically
(P1001), so this is verified-from-source confidence, not an observed test run — said plainly rather than
implied as certain.

**Built anyway, exactly as instructed — explicit, not because the cascade is confirmed broken.** Per
"handle it explicitly in the delete transaction rather than changing the schema," `WeeklyPracticeAttachment`
rows are now deleted with their own explicit `deleteMany` call, in the same `$transaction` as the
`StudentProfile` delete, rather than left to the schema-level cascade alone. This costs nothing — deleting
rows the cascade would also delete is a harmless no-op difference — and means this route's correctness no
longer depends on trusting an implicit mechanism, which is a reasonable instinct on a project that has
specifically been bitten before by schema declarations and applied database state drifting apart. No schema
change was made. If a live foreign-key failure does turn up in Preview/Production, it did not come from the
relationship checked here — that would be the next place to look, not this one.

**Order: recordings, then the Supabase Auth account, then the database, last — and the three failure modes
are not equally bad.** The `StudentProfile` row (and everything named on it — every `storagePath`, the
`supabaseUserId`) is the one piece of information that says what still needs cleaning up. As long as it
exists, a storage or Auth failure is recoverable: retry this route, or clean up by hand using what the row
still names. The database delete is the step with no way back — once it succeeds, that information is gone
for good. So it runs last, only once both steps upstream are confirmed done, never before. Each step fails
loudly and stops; nothing downstream of a failure is attempted — a storage failure never reaches the Auth
deletion, and an Auth failure never reaches the database. This replaces an earlier draft of this same entry,
which had the database delete running *first* — worked out, before anything was built against it, to be the
wrong order: it made the single least-recoverable step happen before either of the two recoverable ones,
rather than after.

**Partial failure never reports success, at any of the three steps.** A storage failure stops before Auth
or the database are touched. An Auth failure stops before the database is touched. A database failure — now
only possible after storage and Auth already succeeded — returns an error naming exactly that state ("the
database delete failed... retry, or delete the remaining row manually"), never `{ ok: true }`. The one gap
left open, stated plainly rather than silently: a retry after a database-only failure will fail again at the
Auth step, because deleting an already-deleted Supabase user errors rather than succeeding as a no-op — that
specific stuck state needs a person to notice the Auth account is already gone and intervene, not a route
this app exposes today.

**Guardrails that replace the protection the old decision provided.** The 2026-08-15 concern was "a delete
button would destroy a student's entire practice history on one misclick." The route itself enforces
nothing about how it's called beyond `requireAdminApi()` — the misclick protection lives entirely in the
admin UI, by design: `StudentDeleteButton` (`src/components/admin/student-delete-button.tsx`) requires the
admin to type the student's exact full name into a text field before the delete button becomes clickable at
all — not a checkbox, not a `window.confirm()` dialog, both of which a reflexive second click clears. The
confirmation dialog states plainly what is destroyed and that it cannot be undone, in that order, before the
input field appears.

**Tests, written failing-first, twice.** `src/app/api/admin/students/[studentId]/route.test.ts` (new — this
route had no test file before this change) was written failing-first for the original database-first order,
confirmed genuinely red (`DELETE is not a function`, the export didn't exist yet) then green — 6 tests. When
the order changed to recordings-then-Auth-then-database, the tests were rewritten for the new order *first*
and re-run against the old implementation, confirming genuine red again (6 of 8 failing, for the right
reasons — wrong call order, wrong failure-mode expectations) before the route was rewritten to match.
Now 8, covering: admin can delete a student end-to-end, with the three steps demonstrated to run in the
correct order (storage, storage, auth, database); neither an unauthenticated request nor a student session
can reach it (both fail the same `requireAdminApi()` guard — there is no code path where a valid student
session satisfies an admin-only check); a nonexistent student 404s before anything is touched; storage
cleanup is attempted for every recording; a storage failure stops immediately with no Auth call and no
database transaction; an Auth failure (after storage already succeeded) stops before the database, still
without reporting success; a database failure — after both storage and Auth already succeeded — still does
not report success; `WeeklyPracticeAttachment` rows are deleted explicitly, in the same transaction as the
profile delete, not left to the cascade alone.

**Still true from 2026-08-15, unchanged by this entry.** Deactivation remains the default, low-risk path for
a student who might come back. This is now available as a second, deliberately harder-to-reach path for
permanent removal — not a replacement for deactivation, and not exposed anywhere a single misclick reaches
it.

---

## 2026-08-17 — Correction: the WeeklyPracticeAttachment cascade stays, deliberately, and what the hard-delete override actually traded

**Supersedes part of the entry immediately above this one** — the same day's entry, not the 2026-08-16
"missing bucket env var" one, which has no foreign-key content at all; that reference, as given, named the
wrong date by one day. The entry above already established, correctly and not disputed here, that
`WeeklyPracticeAttachment.weeklyPractice` is `onDelete: Cascade` in both `prisma/schema.prisma` and the
applied migration SQL — there is no `Restrict` on this relationship, and there never has been. What that
entry did not yet say, and this one records: keeping it that way, and never leaning on it, is now a
permanent, deliberate design decision — not a hedge built "just in case" an unconfirmed bug turned out to be
real.

**Decision — the schema stays exactly as it is; the delete-student route keeps handling
`WeeklyPracticeAttachment` explicitly regardless.** Two reasons, both Abel's, both worth keeping attached to
this code:

1. **A schema-level guarantee here would apply to every future caller, not just this one.** If
   `WeeklyPracticeAttachment`'s cascade were ever tightened — to `Restrict`, to stop it firing implicitly —
   that protection would come from the schema, meaning any future code with a legitimate, unrelated reason to
   delete a `WeeklyPractice` row (nothing does today — checked directly, no `weeklyPractice.delete()` call
   exists anywhere in `src/`) would inherit a blanket decision made in service of *this* feature, not its
   own. Handling it explicitly, in this route's own transaction, keeps that decision local to the one place
   that actually needs it.
2. **The alternative failure shape is exactly the one already logged seven times on this project.** Making
   the relationship `Cascade` and *trusting* that — instead of deleting the rows explicitly and verifying it
   in tests — would mean a future, ordinary `WeeklyPractice` mutation could silently take a student's
   recordings with it, with no confirmation, no typed name, nothing. That is the same shape as every entry in
   the running "guard reads stronger than it enforces" list (2026-08-10 through 2026-08-16): something
   destructive happening by a mechanism nobody looking at the call site would notice. This isn't a new,
   eighth instance of that pattern — it's the same discipline applied pre-emptively, to stop one from ever
   being written. Recorded here so nobody "tidies" this later by deleting the explicit `deleteMany` call as
   apparently-redundant with the cascade — it is redundant today, on purpose, and should stay that way.

**Storage-orphan risk, stated plainly — a known gap, not a solved problem.** Deleting a `WeeklyPractice` or
`WeeklyPracticeAttachment` row by any path *other than* the student-delete route does not clean up the
corresponding Supabase Storage object automatically — nothing about Postgres, the schema, or this project's
conventions makes that happen for free. Checked directly: exactly two code paths delete a
`WeeklyPracticeAttachment` row today. `confirmMyRecordingUpload`'s replace-on-reupload step
(`src/lib/student/queries.ts:498-500`) calls `deleteRecordingObject` first, so it is safe. The new
student-delete transaction is safe for the same reason — storage cleanup runs as its own gated first step,
before the row is touched. Both happen to clean up after themselves today; neither is required to by
anything structural. A hypothetical third path — an admin "delete this one assignment" feature, say, should
one ever be built — would need to remember storage cleanup itself, the same way these two did. Nothing
currently enforces that a new caller can't forget it.

**What the override actually traded.** The 2026-08-15 decision protected against destroying a student's
entire practice history on a misclick by **impossibility** — the button did not exist. This entry's override
does not restore that protection; it replaces it with **friction** — the typed-full-name confirmation makes
the same destruction *possible*, deliberately, gated behind an action specific enough that a misclick cannot
reach it. That is a real reduction in what the system prevents, not a like-for-like replacement, and it was
chosen anyway: Abel traded reversibility for operational convenience — genuinely removing test accounts and
freeing their emails — and for that specific, intended use, friction was enough. It has not been tested as a
defense against anything more determined than an accidental click, and was never meant to be.
