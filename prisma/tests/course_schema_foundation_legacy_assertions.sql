\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "StudentProfile"
    WHERE "id" = 'legacy_student'
      AND "supabaseUserId" = 'legacy-supabase-user'
      AND "email" = 'legacy@example.test'
      AND "portalAccess" = true
      AND "preferredTimeZone" IS NULL
      AND "archivedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy StudentProfile was changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "CourseApplication"
    WHERE "id" = 'legacy_application'
      AND "status" = 'PENDING'
      AND "customerId" IS NULL
      AND "requestedPlanId" IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy CourseApplication was changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Order"
    WHERE "id" = 'legacy_order'
      AND "total" = 42000
      AND "customerId" IS NULL
      AND "customerLinkedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy Order was changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "PaymentConfirmation"
    WHERE "id" = 'legacy_payment_proof'
      AND "orderId" = 'legacy_order'
      AND "amountSent" = 42000
  ) THEN
    RAISE EXCEPTION 'legacy payment proof was changed';
  END IF;

  IF (SELECT count(*) FROM "CoursePrice") <> 3 OR NOT EXISTS (
    SELECT 1 FROM "CoursePrice"
    WHERE "slug" = 'beginner' AND "priceCents" = 7199
      AND "discountType" = 'PERCENT' AND "discountValue" = 30
      AND "discountActive" = true
  ) THEN
    RAISE EXCEPTION 'legacy CoursePrice rows were changed';
  END IF;
END $$;
