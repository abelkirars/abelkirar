import { Resend } from "resend";

// Resend's constructor throws if the key is falsy, so fall back to a
// placeholder in local/dev environments where the key isn't set yet —
// callers must check RESEND_API_KEY before actually sending mail.
export const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
