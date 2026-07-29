# Student Platform Spec

GOAL
Secure student accounts and practice tracking. Admin registers students by email; students log in to a private dashboard. Students must never access another student's data.

ROLES: ADMIN, STUDENT.
Admin only: create/edit/deactivate/delete students, upload weekly practice attachments, create/update/publish monthly logs, view all progress.
Student only: log in, view their own weekly practice, open/download their attachments, view their own published monthly logs, submit weekly practice updates, upload their own attachment.
All admin and student routes protected by server-side role checks. Hiding buttons in the browser is not authorization.

DATABASE
Models (extend existing ones if compatible, do not duplicate):
User, StudentProfile, WeeklyPractice, WeeklyPracticeAttachment, MonthlyLog, MonthlyLogAttachment.
- Supabase auth user id uniquely linked to StudentProfile
- Student email unique
- WeeklyPractice and MonthlyLog each belong to exactly one student
- Attachments belong to their parent record, cascade on delete
- Proper indexes, timestamps, enums
- Unique constraint preventing duplicate MonthlyLog per (student, month, year)
- No destructive migrations, preserve production data

ADMIN STUDENT MANAGEMENT — /admin/students
List all students, search by name/email, add, edit, open profile, activate/deactivate.
Registration fields: full name, email, phone (optional), level (optional), enrollment date, status, notes (optional).
On registration: create or invite the Supabase auth account server-side, create the StudentProfile, assign STUDENT role, link the auth user id, prevent duplicate profiles per email, provide a safe activation/password-creation flow. Never expose temporary passwords in the frontend, logs, or source. Service role key stays server-side only. If invite email cannot be sent, implement the safest supported password-reset flow and document the required configuration.

WEEKLY PRACTICE
Admin routes: /admin/weekly-practice and /admin/students/[studentId]/weekly-practice
Fields: student, week title, week start date, week end date, instructions, goals, teacher notes, status, admin attachments, student submission text, student attachment, submission date, admin feedback, createdAt, updatedAt.
Status enum: NOT_STARTED, IN_PROGRESS, SUBMITTED, REVIEWED, COMPLETED, MISSED.
Admin can: assign to one student, edit, upload/remove/replace attachments, mark reviewed/completed, add feedback, view submissions, filter by student/week/status.
Student can: view only their own, read instructions, view/download admin attachments, mark started, add a short update, upload an attachment when allowed, submit, view feedback.
After submission the student cannot change the work unless an admin reopens it.

MONTHLY LOGS
Admin route: /admin/students/[studentId]/monthly-logs. Student route: /student/monthly-logs.
Fields: student, month, year, attendance/participation summary, practice consistency, skills practiced, strengths, areas needing improvement, teacher comments, student comments (optional), progress rating (optional), goals for next month, attachment (optional), publishedToStudent boolean, createdAt, updatedAt.
Only admins create/edit/publish/delete. Students see only their own PUBLISHED logs. Sort newest month first.

STUDENT DASHBOARD
Routes: /student/dashboard, /student/weekly-practice, /student/monthly-logs, /student/profile.
Dashboard shows: name, current level, enrollment info, current week's practice, recent weekly history, current monthly log, previous monthly logs, teacher feedback, completion status.
Every student route derives identity from the authenticated session and loads only that user's records.

STORAGE
Use a PRIVATE Supabase Storage bucket for student files.
Paths:
  weekly-practice/{studentId}/{weeklyPracticeId}/admin/
  weekly-practice/{studentId}/{weeklyPracticeId}/student/
  monthly-logs/{studentId}/{monthlyLogId}/
Admins access all student files; students access only files assigned to them or uploaded by them; public users access nothing. Validate MIME type and file size, reject dangerous types, sanitize filenames, use signed URLs for private access. Never expose permanent public URLs for student files. Allowed: PDF, images, documents, audio if supported. Add storage policies to migrations or documentation.

SECURITY
Admin pages require ADMIN. Student pages require STUDENT. Re-validate authorization inside every server action and API route. Never trust a studentId sent from the browser — derive it from the session. Validate all form data on the server. Do not leak student information through API error messages.

UI
Keep existing branding, design system, navigation, layout, typography, responsiveness, and component style. Do not rebuild the UI. Include loading states, empty states, validation messages, success/error notifications, confirmation before destructive actions, status badges, attachment links/previews, clear week and month labels. No placeholder buttons — every visible action must work. Support the existing English/Amharic i18n system for all new user-facing strings.

NOTIFICATIONS
Reuse the existing Resend architecture. Add hooks for: student account created, weekly practice assigned, student submitted practice, admin added feedback, monthly log published. Do not send until the relevant env vars are configured. A notification failure must not roll back successfully saved student data.

AUDIT
Preserve who created an assignment, when the student submitted, when feedback was added, when a monthly log was published, and status-change timestamps. Never silently overwrite student submissions or admin feedback.

RESTRICTIONS
Do not remove existing features. Do not weaken authentication. Do not expose service-role keys to the browser. Do not make student files public. Do not allow students to specify another student id. Do not hard-code emails, user ids, passwords, or storage URLs. Do not commit env files or secrets. Do not reset or delete production data. Do not commit or push at any point without my explicit approval.
