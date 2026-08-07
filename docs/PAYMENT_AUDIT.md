# Payment & Order Flow Audit — Current State

Read-only audit. No code, schema, or config was modified. All findings cite
`file:line`. Anything not directly confirmable from source is marked
**UNVERIFIED** — no estimates or invented numbers are included.

Scope: `feature/student-platform` branch, working tree as of this audit.

---

## 1. Payment methods

### What's offered at checkout

The cart/checkout UI ([src/app/store/cart/page.tsx](../src/app/store/cart/page.tsx)) offers a two-step choice:

- **Payment region**: `US` or `EUROZONE` ([src/app/store/cart/page.tsx:19-20](../src/app/store/cart/page.tsx#L19-L20))
- **US region** → customer picks `ZELLE` or `CASH_APP` ([src/app/store/cart/page.tsx:214-232](../src/app/store/cart/page.tsx#L214-L232))
- **EUROZONE region** → only `EUR_BANK_TRANSFER`, not user-selectable, implied by region ([src/app/store/cart/page.tsx:27-28](../src/app/store/cart/page.tsx#L27-L28), [src/app/store/cart/page.tsx:234-240](../src/app/store/cart/page.tsx#L234-L240))

Server-side, [src/lib/validations/order.ts:11-29](../src/lib/validations/order.ts#L11-L29) enforces the same pairing: `US` → `{ZELLE, CASH_APP}`, `EUROZONE` → `EUR_BANK_TRANSFER` only. There is no Stripe/card option and no way to submit any other `paymentMethod` value — the zod enum is `["ZELLE", "CASH_APP", "EUR_BANK_TRANSFER"]` ([src/lib/validations/order.ts:18](../src/lib/validations/order.ts#L18)).

The cart page itself does **not** render the recipient details (Zelle handle, Cash App $cashtag, etc.) — it only shows method-name buttons and short notices (`usMethodNotice`, `eurNotice`). Recipient instructions are rendered later, on the order-confirmation page, after the order row already exists.

### Where Zelle / Cash App / bank-transfer instructions are rendered

Built in [src/lib/notifications/payment-instructions.ts:18-57](../src/lib/notifications/payment-instructions.ts#L18-L57), consumed in two places:

1. **Order confirmation page** — [src/app/store/order/[orderNumber]/page.tsx:44-50](<../src/app/store/order/%5BorderNumber%5D/page.tsx#L44-L50>) and rendered at [src/app/store/order/[orderNumber]/page.tsx:100-117](<../src/app/store/order/%5BorderNumber%5D/page.tsx#L100-L117>).
2. **Customer "order pending" email** — [src/lib/notifications/templates.ts:52](../src/lib/notifications/templates.ts#L52) (`customerOrderPendingEmail`), sent via `notifyCustomerOrderPending` ([src/lib/notifications/index.ts:64-72](../src/lib/notifications/index.ts#L64-L72)).

Exact user-facing text (from [messages/en.json](../messages/en.json), namespace `paymentInstructions`):

- Zelle heading: `"Pay with Zelle"`
- Zelle line: `"Send payment via Zelle to: {name} ({target})"` — `{name}`/`{target}` interpolated from `ZELLE_RECIPIENT_NAME` / `ZELLE_RECIPIENT_EMAIL_OR_PHONE` env vars ([src/lib/notifications/payment-instructions.ts:34-44](../src/lib/notifications/payment-instructions.ts#L34-L44)).
- Cash App heading: `"Pay with Cash App"`
- Cash App line: `"Send payment via Cash App to: {cashtag}"` — from `CASHAPP_CASHTAG` ([src/lib/notifications/payment-instructions.ts:47-56](../src/lib/notifications/payment-instructions.ts#L47-L56)).
- Both: `"Include your order number {orderNumber} in the payment note/memo."` / `"...in the payment note."`
- Euro Bank Transfer heading: `"Euro Bank Transfer"`, body: `"EUR payment details will be provided after the order is placed."` — i.e. **no actual bank details are ever rendered anywhere in the codebase**; only a promise that they'll follow ([src/lib/notifications/payment-instructions.ts:23-30](../src/lib/notifications/payment-instructions.ts#L23-L30)). UNVERIFIED how/whether that follow-up actually happens — no code path sends EUR bank details.

If `ZELLE_RECIPIENT_NAME` / `ZELLE_RECIPIENT_EMAIL_OR_PHONE` / `CASHAPP_CASHTAG` are unset, the placeholders `"(Zelle recipient name not configured)"`, `"(not configured)"`, `"(Cash App $cashtag not configured)"` are shown to the customer verbatim ([src/lib/notifications/payment-instructions.ts:34-35](../src/lib/notifications/payment-instructions.ts#L34-L35), [:47](../src/lib/notifications/payment-instructions.ts#L47)) rather than an error — this fails silently/visibly-broken rather than blocking checkout.

### Translation coverage (messages/en.json vs messages/am.json)

Compared every key in the namespaces touched by checkout/payment: `paymentInstructions`, `paymentLabels`, `cart`, `orderConfirmation`, `paymentConfirmationForm`, `emails.orderPending`, `emails.paymentConfirmed`, `validation`.

**No missing keys in either direction** for any of these namespaces — `am.json` and `en.json` have identical key sets for all of them. (Not exhaustively diffed beyond these payment-relevant namespaces.)

---

## 2. Leftover Stripe code

A repo-wide search for `stripe`/`Stripe`/`STRIPE` (excluding `node_modules`/`.next`) returns matches in exactly three files, all in `prisma/`:

| Location | What | Reachable/live? |
|---|---|---|
| [prisma/schema.prisma:44-47](../prisma/schema.prisma#L44-L47) | `enum PaymentMethod { ZELLE, CASH_APP, EUR_BANK_TRANSFER, STRIPE_LEGACY }` | Dead value going forward — nothing in `src/` ever writes `STRIPE_LEGACY` ([src/lib/validations/order.ts:18](../src/lib/validations/order.ts#L18) doesn't include it in the accepted enum). Only reachable if a pre-existing DB row already has it. |
| [prisma/schema.prisma:108,110-113](../prisma/schema.prisma#L108) | `Order.stripeCheckoutSessionId String? @unique`, `Order.stripePaymentIntentId String?`, with comment "Legacy Stripe fields — no longer written by new orders" | Dead columns — no `src/` code reads or writes `stripeCheckoutSessionId`/`stripePaymentIntentId` (confirmed: these identifiers do not appear anywhere under `src/`). Kept only so historical rows remain intact per the schema comment. |
| [prisma/migrations/20260721123423_manual_payments_zelle_cashapp/migration.sql:1-4](../prisma/migrations/20260721123423_manual_payments_zelle_cashapp/migration.sql#L1-L4) | Migration comment documenting the Stripe→manual-payments switch | Historical record only, not executable logic beyond the `CREATE TYPE`/`ALTER TABLE` statements themselves, which don't touch Stripe. |

No Stripe API routes, webhook handlers, or route folders exist: `src/app/api/*` was enumerated in full ([find src/app/api](../src/app/api)) and contains no `stripe`/`webhook` path. No `stripe` package appears in [package.json](../package.json) (dependencies list `resend`, `twilio`, no `stripe`). No `STRIPE_*` env var is read anywhere in `src/` or `scripts/`.

**Conclusion: nothing would throw if "hit"** because there is nothing left to hit — no live Stripe route, handler, or client exists. The only remaining surface is the two dead Prisma columns and one dead enum value, which are inert unless someone writes new code against them.

---

## 3. Order recording

### Trace: customer submits an order

1. Client `POST /api/orders` from [src/app/store/cart/page.tsx:53-71](../src/app/store/cart/page.tsx#L53-L71).
2. [src/app/api/orders/route.ts:9-71](../src/app/api/orders/route.ts#L9-L71):
   - Rate-limits by IP ([:10-20](../src/app/api/orders/route.ts#L10-L20)).
   - Validates body against `createOrderSchema` ([:29-36](../src/app/api/orders/route.ts#L29-L36)).
   - Calls `createManualOrder` ([:41](../src/app/api/orders/route.ts#L41)), which is where the DB row is created.
   - **Only after** the order is successfully saved does it attempt notifications (wrapped in its own try/catch so a notification failure can't turn a saved order into an error response) ([:50-63](../src/app/api/orders/route.ts#L50-L63)).

### Is an Order row created? At what point?

Yes — in `createManualOrder` ([src/lib/orders.ts:25-92](../src/lib/orders.ts#L25-L92)):
- Re-fetches and re-validates each product server-side; **prices are always recomputed from `computeUnitPrice`, never trusted from the client** ([src/lib/orders.ts:20-23, 30-37](../src/lib/orders.ts#L20-L23)).
- `prisma.order.create(...)` ([src/lib/orders.ts:52-80](../src/lib/orders.ts#L52-L80)) happens **before** any payment has actually occurred — this is a manual-payment flow, so "order creation" and "payment" are always separate steps by design.

### Status/fields at creation

From [src/lib/orders.ts:52-80](../src/lib/orders.ts#L52-L80):
- `orderType: "PRODUCT"`, `status: "PENDING"`, `paymentStatus: "PENDING_VERIFICATION"`
- `paymentRegion`, `paymentMethod` from validated input
- `customerName`, `customerEmail`, `customerPhone`, `locale` (checkout-time locale, [src/lib/orders.ts:63](../src/lib/orders.ts#L63))
- `subtotal`, `total` (equal — no discounts/tax logic present), `currency` (`"eur"` if `EUROZONE` else `"usd"`, [src/lib/orders.ts:47](../src/lib/orders.ts#L47) — note the comment: no currency conversion, the numeric amount is unchanged, only the label differs)
- `items` with per-line `productNameSnapshot`, `productImageSnapshot`, `variantNameSnapshot`, `unitPrice`, `quantity`

### How does the admin mark an order as paid?

[src/app/api/admin/orders/[orderNumber]/mark-paid/route.ts:7-61](<../src/app/api/admin/orders/%5BorderNumber%5D/mark-paid/route.ts#L7-L61)`:
- Requires admin auth ([:11-12](<../src/app/api/admin/orders/%5BorderNumber%5D/mark-paid/route.ts#L11-L12>)).
- Rejects if already `PAID` (409, [:25-27](<../src/app/api/admin/orders/%5BorderNumber%5D/mark-paid/route.ts#L25-L27>)) or if `status === "CANCELLED"` (409, [:28-30](<../src/app/api/admin/orders/%5BorderNumber%5D/mark-paid/route.ts#L28-L30>)).
- Sets `paymentStatus: "PAID"`, `status: "PROCESSING"`, `paymentConfirmedById`, `paymentConfirmedAt` ([:32-41](<../src/app/api/admin/orders/%5BorderNumber%5D/mark-paid/route.ts#L32-L41>)).
- This is a manual, human-in-the-loop action — customer's own payment-confirmation submission ([src/app/api/orders/[orderNumber]/confirm-payment/route.ts](<../src/app/api/orders/%5BorderNumber%5D/confirm-payment/route.ts>)) explicitly **never** marks an order paid itself (comment at [:10-13](<../src/app/api/orders/%5BorderNumber%5D/confirm-payment/route.ts#L10-L13>)); it only writes a `PaymentConfirmation` row ([:84-93](<../src/app/api/orders/%5BorderNumber%5D/confirm-payment/route.ts#L84-L93)>)) for the admin to check against real Zelle/Cash App account activity.
- Related admin actions on the same order: `mark-not-found` → `paymentStatus: "PAYMENT_NOT_FOUND"` ([src/app/api/admin/orders/[orderNumber]/mark-not-found/route.ts:29-33](<../src/app/api/admin/orders/%5BorderNumber%5D/mark-not-found/route.ts#L29-L33>)); `cancel` → `status: "CANCELLED"` ([src/app/api/admin/orders/[orderNumber]/cancel/route.ts:26-30](<../src/app/api/admin/orders/%5BorderNumber%5D/cancel/route.ts#L26-L30>)).

### Any path where checkout completes but no Order row is written?

For the product-order flow (cart → `/api/orders`): no — the response the client depends on (`order.orderNumber` used to redirect to the confirmation page, [src/app/store/cart/page.tsx:75](../src/app/store/cart/page.tsx#L75)) only exists once `prisma.order.create` has already succeeded ([src/lib/orders.ts:52-81](../src/lib/orders.ts#L52-L81)). If product lookup fails, `OrderCreationError` is thrown before any `create` call ([src/lib/orders.ts:32-34](../src/lib/orders.ts#L32-L34)) and the client sees an error, not a false "success."

However, there **is** a distinct, disconnected UI path that captures customer intent but never persists or submits anything: **`CustomOrderNotice`** ([src/components/store/custom-order-notice.tsx](../src/components/store/custom-order-notice.tsx)), shown on product pages where `product.isCustomMade` is true ([src/app/store/[slug]/page.tsx:64](<../src/app/store/%5Bslug%5D/page.tsx#L64>)). It lets a customer type a description and choose a reference image ([:73-149](../src/components/store/custom-order-notice.tsx#L73-L149)), but the component has **no submit handler, no `fetch` call, and no form action at all** — the description/image only ever live in local React state (`useState`) and are discarded on navigation. This is confirmed by [src/lib/notifications/types.ts:11-17](../src/lib/notifications/types.ts#L11-L17), whose comment states plainly: *"There is currently no checkout-time capture path for this — see the storefront CustomOrderNotice component, which is UI-only for now."* A customer who fills this out and expects it to reach the seller gets nothing recorded anywhere — no Order, no email, no DB row of any kind.

---

## 4. Notifications — Email (Resend)

### Order confirmation email

Fires from [src/app/api/orders/route.ts:57-60](../src/app/api/orders/route.ts#L57-L60) via `notificationService.notifyCustomerOrderPending`, implemented at [src/lib/notifications/index.ts:64-72](../src/lib/notifications/index.ts#L64-L72), which calls `sendEmail` ([src/lib/notifications/email.ts:26-50](../src/lib/notifications/email.ts#L26-L50)) with the template from [src/lib/notifications/templates.ts:46-71](../src/lib/notifications/templates.ts#L46-L71) (`customerOrderPendingEmail`).

### Is the Resend error object checked, or swallowed?

**Checked, not swallowed.** [src/lib/notifications/email.ts:26-50](../src/lib/notifications/email.ts#L26-L50):
```ts
const { error } = await resend.emails.send({ from, to, subject, html });
if (error) {
  console.error("[notifications] Resend rejected the email:", error);
  return { sent: false, error: error.message };
}
```
The inline comment explicitly documents why: *"the Resend SDK itself does NOT throw on an API-level rejection... A bare try/catch around the call only ever catches network-level failures and silently missed every one of these API-level rejections — that was a real bug (invite emails failing 100% of the time with zero visible error)"* ([src/lib/notifications/email.ts:16-24](../src/lib/notifications/email.ts#L16-L24)). Both the resolved-error shape and thrown/network-error shape are handled and returned uniformly as `SendEmailResult`.

That said, the **callers** of `sendEmail`/`notificationService.*` in the order routes only log the `SendEmailResult`/rejection at the outer layer or don't inspect it at all — e.g. [src/app/api/orders/route.ts:57-63](../src/app/api/orders/route.ts#L57-L63) awaits `Promise.all([...])` and only catches thrown errors; a `{ sent: false, error }` result returned (not thrown) from `notifyCustomerOrderPending`/`notifyAdminNewOrder` is **not inspected or logged at that call site** — it would only surface via the `console.error` already inside `sendEmail` itself, not a second time at the route level. So: the low-level failure is logged once (inside `email.ts`), but the order-creation code path doesn't additionally check/alert on it.

### Does the admin get an order-notification email? Which address?

Yes — `notifyAdminNewOrder` ([src/lib/notifications/index.ts:83-96](../src/lib/notifications/index.ts#L83-L96)) sends via `sendToAdminEmails` → `adminEmailRecipients()` ([src/lib/notifications/email.ts:52-57](../src/lib/notifications/email.ts#L52-L57)), which reads a comma-separated list from `ADMIN_NOTIFICATION_EMAILS`. If empty/unset, `sendToAdminEmails` treats it as a no-op **success** (`{ sent: true }`, [src/lib/notifications/index.ts:23-27](../src/lib/notifications/index.ts#L23-L27)) rather than a failure — i.e. if `ADMIN_NOTIFICATION_EMAILS` is unset in production, admins silently receive zero order-notification emails and nothing reports that as an error anywhere.

Actual value of `ADMIN_NOTIFICATION_EMAILS` in any deployed environment: UNVERIFIED (not present in source; only declared as a var to set in [.env.example:21](../.env.example#L21)).

### `RESEND_FROM_EMAIL`

Read at [src/lib/notifications/email.ts:27,34](../src/lib/notifications/email.ts#L27) and [src/lib/notifications/email.test.ts](../src/lib/notifications/email.test.ts). If either `RESEND_API_KEY` or `RESEND_FROM_EMAIL` is unset, `sendEmail` no-ops with `{ sent: false, error: "Email is not configured" }` and a `console.warn` ([src/lib/notifications/email.ts:27-30](../src/lib/notifications/email.ts#L27-L30)) — it does not throw or crash the caller.

Whether the sending domain configured in the deployed `RESEND_FROM_EMAIL` value is actually verified in Resend: **UNVERIFIED** — that's an external Resend-dashboard fact, not something derivable from source. [.env.example:19](../.env.example#L19) documents the *requirement* ("must be a verified sending domain, e.g. hello@abelkirar.com") but that is guidance in a template file, not evidence of the current production value or its verification status.

---

## 5. Notifications — Twilio

### Confirmed inert by default

Master switch: `TWILIO_NOTIFICATIONS_ENABLED`, checked via strict string equality in [src/lib/notifications/twilio-client.ts:14-16](../src/lib/notifications/twilio-client.ts#L14-L16):
```ts
export function isTwilioNotificationsEnabled(): boolean {
  return process.env.TWILIO_NOTIFICATIONS_ENABLED === "true";
}
```
Default per [.env.example:35](../.env.example#L35): `TWILIO_NOTIFICATIONS_ENABLED=false`. Any value other than the exact string `"true"` (unset, `"false"`, `"1"`, etc.) is treated as disabled.

Every send path checks this flag before making any Twilio API call and no-ops with a masked console preview otherwise:
- [src/lib/notifications/order-notifications.ts:83-86](../src/lib/notifications/order-notifications.ts#L83-L86) (new-order SMS)
- [src/lib/notifications/order-notifications.ts:136-139](../src/lib/notifications/order-notifications.ts#L136-L139) (new-order WhatsApp)
- [src/lib/notifications/sms.ts:13](../src/lib/notifications/sms.ts#L13) / [src/lib/notifications/whatsapp.ts:17](../src/lib/notifications/whatsapp.ts#L17) (the other four admin events: payment-submitted, payment-confirmed, payment-not-found, order-cancelled)
- [src/lib/notifications/index.ts:36](../src/lib/notifications/index.ts#L36) (`sendToTwilioChannels` short-circuits before even parsing recipients)

### If `TWILIO_NOTIFICATIONS_ENABLED=true` with no real account

`getTwilioClient()` ([src/lib/notifications/twilio-client.ts:18-28](../src/lib/notifications/twilio-client.ts#L18-L28)) returns `null` if `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` are unset — every call site also checks `!client` and falls back to the same no-op preview path (e.g. [src/lib/notifications/order-notifications.ts:83](../src/lib/notifications/order-notifications.ts#L83), [src/lib/notifications/sms.ts:17-20](../src/lib/notifications/sms.ts#L17-L20)). So flipping the flag alone, with SID/token still unset, changes nothing observable beyond the flag check passing — still no live Twilio request.

If SID/token *are* set (to invalid/fake values, or a real-but-unfunded/misconfigured account), the `twilio(sid, authToken)` client constructs successfully (the SDK doesn't validate credentials at construction time) and a real HTTP request is attempted at `client.messages.create(...)`. Every one of those calls is wrapped in `Promise.allSettled` at the call sites ([src/lib/notifications/order-notifications.ts:94-96,148-152](../src/lib/notifications/order-notifications.ts#L94-L96), [src/lib/notifications/sms.ts:22-24](../src/lib/notifications/sms.ts#L22-L24), [src/lib/notifications/whatsapp.ts:28-32](../src/lib/notifications/whatsapp.ts#L28-L32)), and the outer `sendOrderNotifications` also uses `Promise.allSettled` ([src/lib/notifications/order-notifications.ts:186-188](../src/lib/notifications/order-notifications.ts#L186-L188)) — a rejected/failed Twilio request is caught, categorized via `errorCategory` ([src/lib/notifications/sms.ts:41-47](../src/lib/notifications/sms.ts#L41-L47)), logged, and (for the new-order path) recorded on the `Order` row as `smsStatus`/`whatsappStatus: "FAILED"` ([src/lib/notifications/order-notifications.ts:116-122,172-178](../src/lib/notifications/order-notifications.ts#L116-L122)).

**Conclusion: it would fail silently (logged, not thrown), not crash the order flow.** No code path lets a Twilio failure propagate up to `/api/orders` or any admin order-action route — those routes' own notification blocks are additionally wrapped in try/catch (e.g. [src/app/api/orders/route.ts:52-63](../src/app/api/orders/route.ts#L52-L63)).

---

## 6. Env vars

Full inventory of `process.env.*` reads under `src/` and `scripts/` (excluding `src/generated/` and `*.test.ts` files, which only read vars already covered by their non-test counterparts):

**Database**
- `DATABASE_URL` — [src/lib/db.ts:8](../src/lib/db.ts#L8) — pooled connection, used by the running app via the Prisma driver adapter.
- `DIRECT_URL` — [prisma.config.ts:16](../prisma.config.ts#L16) — CLI-only (migrate/introspect), not read by the running app.

**Supabase**
- `NEXT_PUBLIC_SUPABASE_URL` — [src/proxy.ts:78](../src/proxy.ts#L78), [src/lib/supabase-server.ts:18](../src/lib/supabase-server.ts#L18), [src/lib/supabase-browser.ts:11](../src/lib/supabase-browser.ts#L11), [src/lib/supabase-admin.ts:8](../src/lib/supabase-admin.ts#L8), [src/lib/public-image-upload.ts:4](../src/lib/public-image-upload.ts#L4), [src/app/api/admin/upload-instrument-images/route.ts:5](../src/app/api/admin/upload-instrument-images/route.ts#L5)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — [src/proxy.ts:79](../src/proxy.ts#L79), [src/lib/supabase-server.ts:19](../src/lib/supabase-server.ts#L19), [src/lib/supabase-browser.ts:12](../src/lib/supabase-browser.ts#L12)
- `SUPABASE_SERVICE_ROLE_KEY` — [src/lib/supabase-admin.ts:9](../src/lib/supabase-admin.ts#L9), [src/app/api/admin/upload-instrument-images/route.ts:6](../src/app/api/admin/upload-instrument-images/route.ts#L6)
- `SUPABASE_PAYMENT_SCREENSHOTS_BUCKET` — [src/lib/payment-screenshots.ts:8](../src/lib/payment-screenshots.ts#L8)

**Resend / email**
- `RESEND_API_KEY` — [src/lib/resend.ts:6](../src/lib/resend.ts#L6), [src/lib/notifications/email.ts:27](../src/lib/notifications/email.ts#L27), [src/app/api/newsletter/route.ts:27](../src/app/api/newsletter/route.ts#L27), [src/app/api/contact/route.ts:23](../src/app/api/contact/route.ts#L23)
- `RESEND_FROM_EMAIL` — [src/lib/notifications/email.ts:27,34](../src/lib/notifications/email.ts#L27), [src/app/api/newsletter/route.ts:30](../src/app/api/newsletter/route.ts#L30), [src/app/api/contact/route.ts:25](../src/app/api/contact/route.ts#L25)
- `ADMIN_NOTIFICATION_EMAILS` — [src/lib/notifications/email.ts:53](../src/lib/notifications/email.ts#L53)
- `CONTACT_NOTIFICATION_EMAIL` — [src/app/api/contact/route.ts:23,26](../src/app/api/contact/route.ts#L23) (contact form only, not order flow)

**Manual payment instructions**
- `ZELLE_RECIPIENT_NAME`, `ZELLE_RECIPIENT_EMAIL_OR_PHONE`, `ZELLE_ADDITIONAL_INSTRUCTIONS` — [src/lib/notifications/payment-instructions.ts:34-36](../src/lib/notifications/payment-instructions.ts#L34-L36)
- `CASHAPP_CASHTAG`, `CASHAPP_ADDITIONAL_INSTRUCTIONS` — [src/lib/notifications/payment-instructions.ts:47-48](../src/lib/notifications/payment-instructions.ts#L47-L48)

**Twilio**
- `TWILIO_NOTIFICATIONS_ENABLED` — [src/lib/notifications/twilio-client.ts:15](../src/lib/notifications/twilio-client.ts#L15)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — [src/lib/notifications/twilio-client.ts:22-23](../src/lib/notifications/twilio-client.ts#L22-L23)
- `TWILIO_SMS_FROM_NUMBER` — [src/lib/notifications/sms.ts:16](../src/lib/notifications/sms.ts#L16), [src/lib/notifications/order-notifications.ts:79](../src/lib/notifications/order-notifications.ts#L79)
- `TWILIO_SMS_RECIPIENTS` — [src/lib/notifications/order-notifications.ts:78](../src/lib/notifications/order-notifications.ts#L78), [src/lib/notifications/index.ts:39](../src/lib/notifications/index.ts#L39)
- `TWILIO_WHATSAPP_FROM` — [src/lib/notifications/whatsapp.ts:20](../src/lib/notifications/whatsapp.ts#L20), [src/lib/notifications/order-notifications.ts:132](../src/lib/notifications/order-notifications.ts#L132)
- `TWILIO_WHATSAPP_RECIPIENTS` — [src/lib/notifications/order-notifications.ts:131](../src/lib/notifications/order-notifications.ts#L131), [src/lib/notifications/index.ts:40](../src/lib/notifications/index.ts#L40)

**Admin auth**
- `ADMIN_SESSION_SECRET` — [src/lib/admin/session.ts:22](../src/lib/admin/session.ts#L22)
- `ADMIN_USERNAME` — [scripts/change-admin-password.ts:11](../scripts/change-admin-password.ts#L11) (script only, not app runtime)
- `ADMIN_NEW_PASSWORD` — [scripts/change-admin-password.ts:77](../scripts/change-admin-password.ts#L77) (script only)

**App-wide**
- `NEXT_PUBLIC_SITE_URL` — used to build absolute admin/order links across order routes: [src/app/api/orders/route.ts:53](../src/app/api/orders/route.ts#L53), [src/app/api/orders/[orderNumber]/confirm-payment/route.ts:98](<../src/app/api/orders/%5BorderNumber%5D/confirm-payment/route.ts#L98>), [src/app/api/admin/orders/[orderNumber]/mark-paid/route.ts:46](<../src/app/api/admin/orders/%5BorderNumber%5D/mark-paid/route.ts#L46>), [.../mark-not-found/route.ts:38](<../src/app/api/admin/orders/%5BorderNumber%5D/mark-not-found/route.ts#L38>), [.../cancel/route.ts:35](<../src/app/api/admin/orders/%5BorderNumber%5D/cancel/route.ts#L35>), plus student routes.
- `NODE_ENV` — [src/lib/db.ts:13](../src/lib/db.ts#L13), [src/lib/admin/session.ts:68](../src/lib/admin/session.ts#L68)

### Vars the order/payment flow reads but that would be undefined in production if unset — and what happens

None of the order/payment-flow env vars **crash** the app when unset; every read site in this flow has an explicit fallback (verified above: `resend.ts:6` placeholder key, `payment-instructions.ts` "(not configured)" strings, `email.ts:27-30` early return, `twilio-client.ts:24` null client). The practical risk is silent degradation, not a thrown error:

- `ZELLE_RECIPIENT_NAME` / `ZELLE_RECIPIENT_EMAIL_OR_PHONE` / `CASHAPP_CASHTAG` unset → customer sees literal `"(...not configured)"` placeholder text in checkout instructions and in the order-pending email (§1).
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` unset → all emails (customer + admin) silently no-op; order creation still succeeds (§3, §4).
- `ADMIN_NOTIFICATION_EMAILS` unset → admin gets zero new-order emails, reported internally as a "success" (§4).
- `NEXT_PUBLIC_SITE_URL` unset → `adminOrderUrl` link embedded in admin emails becomes `"undefined/admin/orders/..."` (string concatenation with `undefined`) rather than throwing — UNVERIFIED beyond the type signature (`process.env.NEXT_PUBLIC_SITE_URL as string`, an unchecked cast at e.g. [src/app/api/orders/route.ts:53](../src/app/api/orders/route.ts#L53)); no runtime guard against it being unset was found.

Whether any of `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAILS`, `ZELLE_*`, `CASHAPP_*`, `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `DIRECT_URL` are actually set in the live production environment is **UNVERIFIED** — that lives in the hosting provider's env config, not in this repository. `.env.local` exists in the working tree but its contents were not inspected/exfiltrated for this report (out of scope for a source-code audit, and it's git-ignored, not part of "the codebase").

---

## Summary of notable findings (no severity/impact numbers estimated — see task-note above)

- Zelle/Cash App/EUR bank-transfer are the only checkout payment methods; Stripe is fully removed from the checkout path (§1, §2).
- Two dead Prisma columns (`stripeCheckoutSessionId`, `stripePaymentIntentId`) and one dead enum value (`STRIPE_LEGACY`) remain in the schema for historical-row compatibility only; nothing in `src/` reads or writes them (§2).
- Order rows are always created before payment is confirmed (manual-payment model by design); admin confirmation is a separate, explicit, human action (§3).
- `CustomOrderNotice` is a non-functional, disconnected UI component — a customer can fill it out and nothing is ever saved or sent (§3).
- Resend errors are correctly checked (not swallowed) inside `sendEmail`, per an explicit prior-bug comment in the code; but callers of `notificationService.*` in the order routes don't re-inspect the returned `SendEmailResult` (§4).
- Admin new-order emails silently no-op (reported as "sent") if `ADMIN_NOTIFICATION_EMAILS` is unset (§4).
- Twilio SMS/WhatsApp is off by default (`TWILIO_NOTIFICATIONS_ENABLED=false`) and every send path is defensively guarded; enabling it with bad/missing credentials fails silently and cannot crash order creation (§5).
- EUR bank-transfer instructions never actually contain bank details anywhere in the codebase — only a "details will follow" message (§1).
