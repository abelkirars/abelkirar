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
   submit handler.
2. Review and merge the five commits on feature/student-platform.
3. Delete temp/debug-env after confirming the route removal is deployed.
