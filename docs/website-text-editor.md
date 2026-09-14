# Website text editor (`/admin/content`)

Every translated string on the site is editable from the admin panel, in
English and Amharic, without a deploy.

## How it works

`messages/en.json` and `messages/am.json` are still the source of the
wording the site ships with. They are also the fallback. An edit saved in
`/admin/content` is stored as one row in the `SiteCopy` table — `locale`,
`key` (the dot path, e.g. `about.paragraph1`), `value` — and
`src/i18n/request.ts` layers those rows over the file on every request.

That layering point matters: it is the single place every `t()` call in the
app already passes through, so no page, component or email template needs to
know the feature exists.

Three properties are deliberate:

- **A database problem is never a site outage.** `getCopyOverrides` in
  `src/lib/site-copy.ts` catches everything and returns "no overrides",
  which renders the file wording. Same reasoning as `src/lib/site-media.ts`.
- **An override is one leaf string.** `applyOverrides` refuses to create a
  key that does not exist in the file and refuses to replace an object node
  with a string, so a stale row left behind after a rename is inert rather
  than dangerous.
- **"Unedited" has one representation: no row.** Saving a field with exactly
  the wording from the JSON file deletes its row instead of storing a copy of
  the default. That is what **Restore original** does.

## Render-path caching and failure budget

`applyOverrides` always deep-clones the messages object with `structuredClone`,
even when the override set is empty. Frozen nested-default tests and consecutive
request tests verify that imported JSON module objects are never changed.

React `cache()` only deduplicates within a request. `getCopyOverrides` also uses
Next's `unstable_cache` Data Cache, separately per locale, with a 60-second
lifetime. Successful admin saves expire only the affected locale tags using
`revalidateTag(tag, { expire: 0 })`, after the transaction commits. Restoring
file defaults invalidates the same way. Simultaneous cold reads in one instance
are coalesced. This app does not enable Next Cache Components, so adopting
`use cache` would require a separate rendering-architecture change.

Optional text reads use a dedicated pg pool with at most one connection per
instance. Cold connections have 1500ms to establish; client-query and
server-statement timeouts stay at 200ms. The socket stays open for 90 seconds
when idle, longer than the cache's 60-second lifetime, so regular refreshes can
reuse it. They do not compete for the main order/auth Prisma pool.

Rendering waits at most 300ms for the full cache lookup, subject to JavaScript
timer scheduling. If the read is still pending, Next's `after()` keeps the
invocation alive to finish that read and its cache write after the response.
The read itself has a separate 2000ms deadline. A healthy cold connection taking
500ms therefore causes the first request to show shipped wording, then warms
the cache with the saved text for later requests. The render fallback is NOT
cached as an empty result. Only an actual read failure produces empty overrides
cached for 60 seconds to avoid retrying for every visitor during an outage.
Cached wording may be served during background refresh.

These are wait deadlines, not a claim that Promise.race cancels SQL. The reader
also has its own driver and server timeouts. Other database-backed features on
a page retain their existing timeout behavior. Admin audit reads and writes
continue to use Prisma and report database failures.

Tests exercise the real Next Data Cache for cross-request reuse, locale
separation, expiration, tag invalidation and late successful reads. Controlled
timers test exact render/read deadlines instead of brittle wall-clock ceilings.
An actual pg connection to a local TCP server that accepts but never responds
verifies that the driver rejects and installs its 1500ms connection timer,
without asserting how quickly a busy worker schedules it. These tests do not
measure healthy connection latency from the deployed Vercel region.

Production deployment remains a separate step: local database credentials are
unavailable, so do not retry the password helper or run local migrations. The
existing Vercel build runs the reviewed `prisma migrate deploy` before building
the app. File review/approval must finish before committing or deploying.

## The one guard worth knowing about

Some strings contain placeholders — `{orderNumber}`, `{count}`, `{year}`.
next-intl throws rather than rendering a message whose arguments do not line
up, so dropping one would take a page down. `PUT /api/admin/content` refuses
any edit that loses or invents a placeholder, and the editor shows which ones
a field needs. The wording around a placeholder can change freely.

## Course pages

Course display copy used to be hard-coded English in `src/lib/courses-data.ts`,
which meant the Amharic course detail pages rendered English and the detail
page could disagree with the cards on `/courses`. It now comes from
`courseLevels.<slug>.*` (shared with the cards) and
`courseDetails.<slug>.topic1..3`. `courses-data.ts` keeps only what is not
copy: slug, price, and `StudentLevel`.

The Amharic `courseDetails` topics are currently seeded with the English text
— that is what those pages showed before, and they are now editable at
`/admin/content` → **Course pages**.

## Running it locally

```
npx prisma generate        # required: the client needs the SiteCopy model
npx prisma migrate deploy  # creates the SiteCopy table
npm run typecheck
npm run lint
npm test
```

On Vercel the migration runs as part of `npm run build`
(`prisma generate && prisma migrate deploy && next build`).

## Adding a language

Add the JSON file, add the locale to `src/i18n/locale.ts`, and add the line
to `DEFAULT_COPY` in `src/lib/site-copy-defaults.ts` — the type annotation
there makes forgetting that line a compile error. No migration: `SiteCopy.locale`
is a plain string.
