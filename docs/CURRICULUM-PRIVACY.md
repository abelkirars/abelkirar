# Curriculum privacy

The founder's master curriculum is confidential reference material. It stays
outside this website project. Do not copy its contents into source code,
translations, test fixtures, screenshots, public storage, or deployment files.

## Public website

Use broad course-level outcomes only. Do not publish detailed lesson sequences,
exercise mechanics, signature methods, repertoire lists, teaching scripts,
assessment criteria, or internal references. The public course data module is
reachable from browser bundles; it must never import private teaching data.

Admin Website media is a PUBLIC preview library. Its titles and transcripts are
public too. Full lessons, paid recordings, workbooks, and the master manual do
not belong there. PDF uploads are rejected by the public media endpoint.

## Student access

Continue using the server-verified student session and explicit field selections.
Students receive their own assigned work and permitted feedback. Teacher-private
notes, internal curriculum references, assessment criteria, and future work must
not be sent to a student and then merely hidden by the interface.

## Accidental publication safeguards

Git and Vercel exclusions cover the supplied master-manual filename family and
private-curriculum directories. These are additional safeguards, not encryption
or permission controls. Keep the actual source outside the project even when an
ignore pattern would match it.

Access restrictions cannot prevent a permitted viewer from photographing or
copying material they can see. Keep the master method private and release only
the material needed for each student's assigned work.

## Verification for this change

92 targeted tests passed, including student ownership, teacher-only field
exclusion, recording access, and rejection of PDFs in public media placements.
TypeScript and ESLint passed. The source manual was read locally, not uploaded
or copied into the repository. No new student access or document viewer was
created by this change.

Deployment authorized explicitly by the founder and completed: dpl_FTGgQ3ba279eEN76cq3XpQX7PCLn, production alias www.abelkirar.com. All three live course detail pages returned 200 with the broad overview copy and no PDF links. Anonymous requests to admin media and student dashboard redirected to their respective login pages (307). Homepage, store and database health returned 200. The original manual remains outside the website project, and no curriculum/manual files exist under public/.
