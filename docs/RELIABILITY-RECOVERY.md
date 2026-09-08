# Abelkirar reliability recovery — September 5, 2026

Production logs and a direct connection check identified invalid Supabase Postgres credentials (`P1000` / `28P01`). The user subsequently supplied the valid database password. Both local connections were verified, and `DATABASE_URL` and `DIRECT_URL` were updated as production secrets in Vercel. The temporary password file and repair scripts were removed. The normal deployment is now used again.

## Recovery and deployment

- Homepage product imagery loads inside Suspense, independently of the hero and course content. Failed queries retain the category links.
- Store and product detail pages show a retry/contact fallback instead of throwing an unhandled server error. Empty catalogs and unavailable catalogs have distinct states. Invalid category filters and malformed image JSON are handled safely.
- Community announcements fail independently of the public community content.
- Root and store error boundaries provide retry behavior using the installed Next.js version's `unstable_retry` API.
- Connection and query timeouts bound database failures. `/api/health` exercises the product schema and returns 503 during an outage, even when the marketing pages return 200.
- Contact and newsletter failures show a message and retain entered details.

The initial recovery build used `docs/reliability-deployment.json` to run `prisma generate && next build` without attempting a database migration during the authentication outage. The normal `package.json` build still runs migrations and is used after the credential repair. Both pending migrations were successfully applied: the existing `20260826120000_add_course_applications` migration and `20260905180000_correct_cultural_product_copy`. The course migration preserves existing students' portal access. Public reads additionally correct the same exact known seed mistakes.

For a future credential change, update `DATABASE_URL` and `DIRECT_URL` in Vercel and `.env.local`, preserving the pooled application and direct migration connection formats. Never commit credentials. Use the normal build/deployment and confirm `/api/health` returns 200, products render, and admin authentication and saved submissions work.

## Website media

Open **Admin → Website media**, `/admin/media`.

| Placement | Accepted formats | Public location |
| --- | --- | --- |
| Homepage performance | MP4, WebM | Below the homepage hero |
| Course sample lesson | MP4, WebM | Courses |
| Kirar demonstration | MP3, M4A, WAV, OGG | Courses |
| Teacher photograph | JPEG, PNG, WebP | About and Courses |

Maximum file size: 50 MB. Choose a file, preview it, enter a title and transcript/description, then select **Upload and publish**. After publication, edit the title or transcript and select **Save details** to keep the existing file. **Unpublish** removes the placement while retaining its uploaded file. These uploads are public website assets; private student recordings use the existing separate student system.

The browser uploads directly to Supabase using an admin-authorized signed URL, avoiding the serverless request-body limit. Publication checks the stored object's type and size, the placement, and the current admin's path. The dedicated public `site-media` bucket has been provisioned with the matching size and format restrictions. No sample media was published; the user's recordings and photograph are still forthcoming.

## Content and mobile changes

- Corrected Mekwamiya (liturgical prayer/chanting staff), Kaba (ceremonial clothing), Tsenatsl (shaken sistrum), and Pickups in seed sources and a targeted data migration. Existing custom descriptions are preserved.
- The live Other category contains Washint and Kebero, so its displayed label is Wind & Percussion. Database enum values and existing URLs are preserved. Generic legacy Begena and Masenqo names are normalized without renaming custom builds.
- Product cards show existing custom-order availability, shipping regions, production-time guidance, and a clearer details action. No invented turnaround estimates or sales counts.
- Public learning CTAs and form wording consistently refer to the course waitlist. Unexplained prices are hidden pending confirmation of final fees and terms.
- Five-string/six-string copy asks applicants to identify their instrument so the course setup can be confirmed; support for both is not promised without confirmation.
- Buttons are 44–56 px, inputs/selects 48 px, and primary gold is darkened to `#8a5f10`. Mobile hero actions stack evenly. The community action appears lower on the page.
- Shorter mobile sections, a two-column footer link list, and responsive admin navigation.
- No placeholder performance videos, fabricated teacher photographs, course dates, lesson counts, or testimonials were published.

## Verification

- Full suite after shopping improvements: 49 test files, 392 tests passed.
- TypeScript and ESLint passed; production build succeeded locally with network access and on Vercel.
- Regression coverage includes database outages vs. empty catalogs, malformed image JSON, cultural corrections, upload authorization, object/path validation, size/type limits, publication failure, and health status.
- Initial recovery check, before credential repair: homepage, store, and Community returned 200; store visibly reported unavailable products; health returned 503; unauthenticated `/admin/media` redirected to login.
- Main public pages checked at 390×844, 393×852, and 430×932 without horizontal overflow. Mobile menu opens and closes. Hero actions measured 56 px high and menu control 44×44 px.
- Initial screenshots cover the unavailable catalog state. After credential repair, the homepage, store, community, courses, health endpoint, and all 11 active product pages returned 200 with no outage markers. All 11 products have photos. The media API correctly returned 401 without authentication, and the admin login database/rate-limit path correctly returned 400 for an empty validation request. No actual order, application, or media publication was submitted during these checks.

## Screenshot gallery

| Page | 390×844 | 393×852 | 430×932 |
| --- | --- | --- | --- |
| Homepage | [Screenshot](qa-reliability/home-390.png) | [Screenshot](qa-reliability/home-393.png) | [Screenshot](qa-reliability/home-430.png) |
| Store fallback | [Screenshot](qa-reliability/store-390.png) | [Screenshot](qa-reliability/store-393.png) | [Screenshot](qa-reliability/store-430.png) |
| Courses | [Screenshot](qa-reliability/courses-390.png) | [Screenshot](qa-reliability/courses-393.png) | [Screenshot](qa-reliability/courses-430.png) |
| About | [Screenshot](qa-reliability/about-390.png) | [Screenshot](qa-reliability/about-393.png) | [Screenshot](qa-reliability/about-430.png) |
| Blog | [Screenshot](qa-reliability/blog-390.png) | [Screenshot](qa-reliability/blog-393.png) | [Screenshot](qa-reliability/blog-430.png) |
| Contact | [Screenshot](qa-reliability/contact-390.png) | [Screenshot](qa-reliability/contact-393.png) | [Screenshot](qa-reliability/contact-430.png) |
| Community | [Screenshot](qa-reliability/community-390.png) | [Screenshot](qa-reliability/community-393.png) | [Screenshot](qa-reliability/community-430.png) |

Student Login was additionally checked at 390×844: [Screenshot](qa-reliability/student-login-390.png).

## Monitoring

The active **Monitor Abelkirar uptime** Codex automation checks hourly. It checks HTTP failures, server-error content, the store's unavailable marker, and the health endpoint. It retries failures once and reports confirmed outages, meaningful changes, or recoveries rather than repeating unchanged notifications. It does not modify the site or message third parties.

## Shopping and media follow-up — September 6

- Product option buttons and finish swatches are at least 48 px, grouped and labeled for assistive technology. The chosen finish has a visible name; negative price adjustments read `-$15`.
- Cart quantities match the server's integer limit of 1–10, including repeated additions and migrated old carts. Monetary amounts preserve cents. Checkout fields have persistent labels and autocomplete; region/payment controls expose selection.
- Published media titles and transcripts can be saved without uploading the file again. The authenticated PATCH route accepts text only and retains the server-read media URL and MIME type.
- Local browser checks exercised product choices, excessive quantity input, cart persistence, selection totals, removal, and payment region switching. Product and cart layouts had no horizontal overflow at 390×844, 393×852, and 430×932. No order was submitted.
- Signed-in media upload remains untested in the browser because an admin login session is not available. API tests cover authorization, text editing, missing media, and storage errors.

| Follow-up view | 390×844 | 393×852 | 430×932 |
| --- | --- | --- | --- |
| Product options | [Screenshot](qa-reliability/product-improved-390.png) | [Screenshot](qa-reliability/product-improved-393.png) | [Screenshot](qa-reliability/product-improved-430.png) |
| Cart | [Screenshot](qa-reliability/cart-improved-390.png) | [Screenshot](qa-reliability/cart-improved-393.png) | [Screenshot](qa-reliability/cart-improved-430.png) |

Production deployment dpl_2T1o2RJTo6R9vhzGU6RZx9ymjPqa is READY and aliased to www.abelkirar.com. Homepage, store, Normal Kirar, courses and health returned 200; health reported catalog available. Unauthenticated media PATCH returned 401. Live mobile controls: qa-reliability/product-live-controls-390.png.

## Admin save-button correction

The first media editing follow-up added PATCH handling but left the submit button disabled without a new file. Corrected the button to show enabled **Save details** for published media, and added rendered-component tests covering both published and empty placements. Added **Clear selected file** to return to editing the existing placement. Targeted UI/API checks: 11 passed; lint and TypeScript passed.

Product detail images now load eagerly and use responsive size hints; gallery thumbnails and image customization choices request appropriately sized images. Store card prices preserve cents consistently with product details and cart totals.

## Compact store introduction
Shortened the store title and shipping copy in English and Amharic. Mobile title is 24 px, description 14 px, with 24 px header padding and reduced spacing around search. At 390 px width, the header shrank from 416 px to 158 px and the first Kirar photo moved from y=617 to y=319. Verified 390x844, 393x852 and 430x932 with no horizontal overflow. Screenshots: qa-reliability/store-compact-390.png, store-compact-393.png, store-compact-430.png. Lint and TypeScript passed.

Final production browser verification completed: mobile menu Store link navigates to the top of the compact store. English at 390x844, 393x852 and 430x932: header 158 px, first Kirar photo y=319, image loaded, no horizontal overflow. Amharic at 390x844 also fits without horizontal overflow. Screenshots: qa-reliability/store-compact-live-390.png, store-compact-live-393.png, store-compact-live-430.png, store-compact-live-am-390.png. The earlier usage-limit block is resolved.
