\set ON_ERROR_STOP on

-- Run against a database built from the committed pre-Phase-1 schema.
INSERT INTO "StudentProfile" (
  "id", "supabaseUserId", "email", "fullName", "portalAccess",
  "createdAt", "updatedAt"
) VALUES (
  'legacy_student', 'legacy-supabase-user', 'legacy@example.test',
  'Legacy Student', true, TIMESTAMP '2026-01-01 00:00:00',
  TIMESTAMP '2026-01-01 00:00:00'
);

INSERT INTO "CourseApplication" (
  "id", "fullName", "email", "requestedLevel", "status", "locale",
  "createdAt", "updatedAt"
) VALUES (
  'legacy_application', 'Legacy Applicant', 'applicant@example.test',
  'BEGINNER', 'PENDING', 'en', TIMESTAMP '2026-01-02 00:00:00',
  TIMESTAMP '2026-01-02 00:00:00'
);

INSERT INTO "Order" (
  "id", "customerEmail", "customerName", "currency", "subtotal", "total",
  "createdAt", "updatedAt"
) VALUES (
  'legacy_order', 'buyer@example.test', 'Legacy Buyer', 'usd', 42000, 42000,
  TIMESTAMP '2026-01-03 00:00:00', TIMESTAMP '2026-01-03 00:00:00'
);

INSERT INTO "PaymentConfirmation" (
  "id", "orderId", "senderName", "amountSent", "sentAt", "screenshotPath",
  "createdAt"
) VALUES (
  'legacy_payment_proof', 'legacy_order', 'Legacy Buyer', 42000,
  TIMESTAMP '2026-01-03 01:00:00', 'legacy/proof.png',
  TIMESTAMP '2026-01-03 01:00:00'
);

INSERT INTO "CoursePrice" (
  "slug", "priceCents", "discountType", "discountValue", "discountActive",
  "updatedAt"
) VALUES
  ('beginner', 7199, 'PERCENT', 30, true, TIMESTAMP '2026-01-04 00:00:00'),
  ('intermediate', 8599, 'PERCENT', 20, true, TIMESTAMP '2026-01-04 00:00:00'),
  ('advanced', 9999, 'PERCENT', 10, true, TIMESTAMP '2026-01-04 00:00:00');
