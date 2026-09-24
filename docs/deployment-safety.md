# Application deployment and database migration are separate

`npm run build` runs only `prisma generate && next build`. It does not apply
migrations or seed data. `npm start` only starts Next.js. There are no repository
install/build lifecycle hooks that deploy migrations, and `vercel.json` has no
build/install overrides. Verify dashboard overrides before each release: a
hosting-side command can bypass repository safeguards.

`npm run db:migrate:deploy` is the explicit migration operation. It requires
separate authorization, a verified target and a fresh recoverable backup. It
applies ALL pending migrations, so first verify the exact pending list. Never
run it as a build/install hook, and never run `migrate dev`, reset or seed against
production. The build-safety regression tests protect the repository commands.

## Environment requirements

| Variable | Production | Preview / Development |
| --- | --- | --- |
| `DATABASE_URL` | Runtime Prisma adapter and site-copy pg pool; also used by manual data scripts | Use only an isolated non-production database for functional testing |
| `DIRECT_URL` | Prisma CLI migration/status datasource; also required while loading config for generation | Config still requires a URL for generation; a loopback placeholder suffices for generation-only builds, otherwise use the isolated database |
| `DATABASE_CA_CERT` | Required for remote database trust in production runtime and CLI | Preview uses `NODE_ENV=production`, so remote connections also require the appropriate CA; local development may use the ignored local CA fallback |

`prisma generate` loads `prisma.config.ts` but does not authenticate or apply SQL.
Consequently a successful build does not verify credentials. Runtime does not
use `DIRECT_URL`; Vercel does not need working production migration credentials
merely to generate the client. The existing config still requires the variable
and validates CA material for remote URLs. No credential/config changes are
included in this build-separation change.

Both application and CLI paths centralize TLS trust in `database-tls.ts`. URL
SSL parameters (including old local certificate paths) are removed before
verified CA settings are applied. Do not disable certificate verification.
Inspect manual third-party commands separately: they may bypass this helper.

Preview does not need production database access. Do not copy production URLs,
Supabase service-role credentials, or live email/payment credentials into
Preview. Use isolated backend credentials and test delivery controls; a
generation-only build with dummy credentials is not a functional preview.

Vercel secret metadata does not prove credential validity. An old timestamp
alone is not proof of staleness. Verify the actual hosting values securely or
have the owner replace them with known-current values; neither action should
trigger a deployment before database compatibility is established.

Read-only hosting inspection on 2026-09-24 confirmed no build/install/root
override, Next.js framework, Node 24.x, and production branch `main`. The current
production deployment is still `2489b5eb5cc5c2157faeed490040e04b9073d2fb`.
Production URL secrets were last updated 2026-09-06 UTC; the Production CA secret
was updated 2026-09-24 UTC. Preview has both URL secrets (2026-08-28 UTC) but no
CA entry. Secret values are not readable through metadata inspection, so hosted
URL authentication remains UNVERIFIED; both local URLs passed strict-TLS,
read-only authentication. Preview requires separate non-production credentials
and matching CA before remote-backed preview builds can be approved. The project
currently has zero Vercel cron definitions. No hosting settings were changed.

## Monthly billing release gate (migration 28)

The old deployed store application does not use the course billing tables and
is schema-compatible with DB27 and DB28. The new application requires DB28:
its Prisma model reads `CourseEnrollment.billingTimeZone` and its billing code
uses the new notification kinds and database invariants. Build success is not
evidence that the new application can run on DB27.

The safest release order, requiring explicit approval for consequential steps:

1. Verify/correct Production credentials and CA for the next deployment, without
   redeploying. Verify Vercel build command uses the decoupled package script,
   Preview credentials are isolated, and scheduler remains disabled. Authenticate
   using strict TLS; verify the target, migration history and pending list.
2. Create and verify a fresh production backup immediately before migration.
3. Separately authorize and apply ONLY reviewed migration 28 from a controlled
   runner. The explicit deploy script is appropriate only if 28 is the sole
   pending migration. If Prisma connectivity fails, stop; do not retry or switch
   to manual SQL/history reconciliation without separate approval.
4. Verify 28 applied, no incomplete history, expected schema/constraints,
   preserved legacy data, and no generated business/notification records.
5. Only then authorize pushing the approved application checkpoint. Main may
   auto-deploy on Vercel, so pushing is a release action. Deploy the new checkpoint,
   not an old revision without centralized CA support.
6. Run authorized production smoke tests (strict TLS, store/guest checkout,
   authentication and course/admin paths; no real transactions or emails unless
   separately approved). Keep the previous deployment available for app rollback;
   do not reverse financial/history schema or delete data to roll back the app.
7. Configure/activate the scheduler LAST, under separate authorization, after
   billing, reminder delivery, provider/domain and secret configuration are
   verified. No scheduler activation is part of this engineering checkpoint.

This document supersedes older reports describing migrations as part of builds.
