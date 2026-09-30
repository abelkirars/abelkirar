// Academy proofs pass through a Vercel function as multipart form data.
// Display a rounded 4 MB maximum, but reserve room for fields and multipart
// overhead below the platform's 4.5 MB request limit. Keep this browser-safe.
export const MAX_COURSE_PAYMENT_PROOF_BYTES = 3_800_000;
