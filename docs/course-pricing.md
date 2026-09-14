# Course pricing and discounts

Implemented locally on 2026-09-14. No database migration, commit, push, build, or deployment was run. Existing uncommitted website-text work was preserved.

## Display inventory

Before this change:

- `src/app/courses/[slug]/page.tsx:66` was the only rendered course price: `(course.price / 100).toFixed(0)`.
- `src/app/courses/page.tsx` uses `src/components/marketing/course-level-cards.tsx`; these cards had no prices.
- `src/components/forms/course-application-form.tsx` and `src/lib/notifications/course-application-notifications.ts` contain no course-price display. They remain unchanged.
- No admin course pricing view existed. Store product/order prices are separate and unchanged.

After this change, detail pages and listing cards render `CoursePrice`, which calls the server-only `getCoursePricing`. The new `/admin/courses` page and its server preview use the same function. `CoursePriceAmount` only formats the returned amounts and renders translated labels; it does not calculate discounts.

## Files changed

| File | Purpose |
| --- | --- |
| `prisma/schema.prisma` | Add only `CourseDiscountType` and `CoursePrice`; keep Product unchanged. |
| `prisma/migrations/20260914000000_add_course_prices/migration.sql` | Create pricing table and enum, enforce valid values, insert the original three prices. |
| `src/lib/courses-data.ts` | Document that existing cents values are fallbacks and database rows are authoritative. |
| `src/lib/validations/course-price.ts` | Validate positive integer cents, percentages 1–100, fixed discounts below the base price, and consistent nullable fields. |
| `src/lib/course-pricing.ts` | Single server-only discount calculation and missing-row fallback. |
| `src/app/admin/(authenticated)/courses/page.tsx` | Server-guarded editor for the three existing course slugs. |
| `src/app/api/admin/courses/[slug]/route.ts` | Server-guarded PUT save and read-only POST preview; validate both. |
| `src/components/admin/course-price-form.tsx` | Existing form styling/submission pattern, cents labels, toggle, visible errors, debounced server preview, stale-response cancellation. |
| `src/app/admin/(authenticated)/layout.tsx` | Add a translated course-pricing navigation link. |
| `src/components/marketing/course-price.tsx` | Server pricing lookup shared by public display sites. |
| `src/components/marketing/course-price-amount.tsx` | Exact cents formatting, strike-through price and translated discount badge. |
| `src/app/courses/[slug]/page.tsx` | Replace hardcoded price rendering. Application flow remains intact. |
| `src/components/marketing/course-level-cards.tsx` | Add current prices/discounts to listing cards. |
| `messages/en.json`, `messages/am.json` | Add all new public/admin labels, errors and statuses. |
| `src/lib/course-pricing.test.ts` | Real page/guard and pricing/validation tests, with cookie/storage boundaries controlled. |
| `src/app/api/admin/courses/[slug]/route.test.ts` | Route validation, preview/save consistency, writes, error responses and revalidation tests. |
| `src/components/marketing/course-price-amount.test.ts` | Render actual price component in EN/AM and check discounted/non-discounted markup. |
| `docs/course-pricing.md`, `docs/course-pricing.diff` | Implementation report and complete implementation diff against the pre-task working tree. |

## Units and display behavior

- `priceCents` and FIXED `discountValue` are integer US cents. The editor explicitly labels both and explains that 7000 means $70.
- PERCENT `discountValue` is an integer from 1 through 100. Changing types clears the old value to avoid carrying cents into a percentage field.
- BigInt arithmetic implements positive `Math.round(basePriceCents * percentage / 100)` exactly. A 50% discount on 101 cents removes 51 cents, leaving 50 cents.
- Fixed discounts show a whole percent rounded down so the badge cannot claim 100% off while money is still due. Discounts below 1% receive a translated “Less than 1% off” badge.
- With an inactive discount or null type, the final price equals the base price. There is no strike-through or badge.
- Missing rows fall back to 7000/8500/10000. Database errors are not treated as missing rows: the error surfaces rather than advertising a potentially incorrect fallback price.

## Migration — run manually

From the repository directory, with the intended database configuration available:

```powershell
npx prisma migrate deploy
```

This applies **all pending migrations**, including any pending migration from the pre-existing website-text work. Apply before running/deploying this code against that database. `prisma generate` was run locally to update generated TypeScript types; it did not migrate or seed the database.

The complete SQL is:

```sql
CREATE TYPE "CourseDiscountType" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "CoursePrice" (
    "slug" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "discountType" "CourseDiscountType",
    "discountValue" INTEGER,
    "discountActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoursePrice_pkey" PRIMARY KEY ("slug"),
    CONSTRAINT "CoursePrice_price_positive" CHECK ("priceCents" > 0),
    -- PERCENT values are whole percentages; FIXED values are CENTS.
    CONSTRAINT "CoursePrice_discount_valid" CHECK (
      ("discountType" IS NULL AND "discountValue" IS NULL AND NOT "discountActive")
      OR ("discountType" IS NOT NULL AND "discountType" = 'PERCENT' AND "discountValue" IS NOT NULL AND "discountValue" BETWEEN 1 AND 100)
      OR ("discountType" IS NOT NULL AND "discountType" = 'FIXED' AND "discountValue" IS NOT NULL AND "discountValue" > 0 AND "discountValue" < "priceCents")
    )
);

INSERT INTO "CoursePrice" ("slug", "priceCents", "updatedAt") VALUES
    ('beginner', 7000, CURRENT_TIMESTAMP),
    ('intermediate', 8500, CURRENT_TIMESTAMP),
    ('advanced', 10000, CURRENT_TIMESTAMP);
```

## Caching evidence

Two read-only requests to `https://abelkirar.com/courses/beginner`, at approximately 21:01 and 21:05 UTC on 2026-09-13, returned:

```text
HTTP 200
Cache-Control: no-store, must-revalidate, no-cache, max-age=0, private
X-Vercel-Cache: MISS
Age: 0
```

The second request sent `NEXT_LOCALE=am` and returned `<html lang="am">`. This is empirical evidence that the **currently deployed** course page is served per request without shared page caching. It is not a production test of these undeployed changes. Locally, the Next.js 16.2.10 caching/route-handler/revalidatePath documentation was read before editing.

The new function performs uncached Prisma reads. Successful saves call `revalidatePath('/courses')`, `revalidatePath('/courses/<slug>')`, and `revalidatePath('/admin/courses')`; the form also calls `router.refresh()`. Public pages show saved pricing on the next request. Already-open public pages are not live subscriptions and must be refreshed.

## Verification

The six requested acceptance tests were written and run **before implementation**:

| Test | Before | After |
| --- | --- | --- |
| Non-admin cannot load pricing page | FAIL | PASS |
| Non-admin cannot directly mutate pricing | FAIL | PASS |
| PERCENT 101 is rejected | FAIL | PASS |
| FIXED equal to or above base is rejected | FAIL | PASS |
| Inactive discount preserves base price | FAIL | PASS |
| Missing row uses hardcoded fallback | FAIL | PASS |

The initial failures were missing-module errors because the feature did not exist, not demonstrated vulnerabilities in an existing pricing implementation. First run: 6 failed, exit 1. After implementation: 6 passed. One first post-implementation cold import exceeded Vitest's default 5-second limit; the page test now allows 20 seconds.

Latest focused run:

```powershell
npm test -- src/lib/course-pricing.test.ts 'src/app/api/admin/courses/[slug]/route.test.ts' src/components/marketing/course-price-amount.test.ts src/lib/courses-data.test.ts src/lib/site-copy-keys.test.ts
```

**69 tests passed across 5 files.** Includes actual validator and pricing execution, real admin/session denial, exact rounding, 100% discounts, maximum stored integer, invalid inputs, missing rows, no persistent cache, server preview/save equality, ignored client-supplied final price, rejected unknown slugs, failed writes, and EN/AM rendering. Storage/cookie boundaries are substituted; authenticated mutation tests substitute only authentication/storage/revalidation boundaries. This is not a real Postgres persistence or interactive browser test.

Local Next.js HTTP checks independently returned:

- `GET /admin/courses` without an admin session: **307**, `Location: /admin/login`.
- `PUT /api/admin/courses/beginner` without an admin session: **401**.

`npx prisma validate`: **PASS**. `git diff --check`: **PASS**. Targeted ESLint on the new implementation and test files: **PASS**.

`npm run typecheck`: **FAIL**, with only the pre-existing `src/lib/courses-data.test.ts:79` TS2352 error. That existing test casts `messages.courseLevels` to `Record<string, Record<string, string>>`, but `exploreCurriculum` is a string. Neither the test nor those pre-existing message entries were changed by this task. No errors were reported in the new feature files.

Real database persistence, applying the SQL constraints, a saved-price public refresh, and the authenticated interactive editor remain unverified until the migration is applied. No course checkout, Stripe, cart, order pricing, student visibility, or course-application behavior changed.
