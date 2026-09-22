import "server-only";

import type { User } from "@supabase/supabase-js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export class CustomerAuthenticationError extends Error {}
export class CustomerEmailNotVerifiedError extends Error {}

export function normalizeCustomerEmail(email: string): string {
  return email.trim().normalize("NFKC").toLowerCase();
}

type VerifiedCustomerIdentity = {
  supabaseUserId: string;
  email: string;
  emailNormalized: string;
  emailVerifiedAt: Date;
};

async function readVerifiedCustomerIdentity(): Promise<VerifiedCustomerIdentity> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new CustomerAuthenticationError("Authentication required");

  return verifiedIdentityFromUser(user);
}

export function verifiedIdentityFromUser(user: User): VerifiedCustomerIdentity {
  if (!user.email || !user.email_confirmed_at) {
    throw new CustomerEmailNotVerifiedError("A verified email address is required");
  }

  const emailVerifiedAt = new Date(user.email_confirmed_at);
  if (Number.isNaN(emailVerifiedAt.getTime())) {
    throw new CustomerEmailNotVerifiedError("Verified email timestamp is invalid");
  }

  return {
    supabaseUserId: user.id,
    email: user.email.trim(),
    emailNormalized: normalizeCustomerEmail(user.email),
    emailVerifiedAt,
  };
}

/** Resolve identity only by the immutable Supabase user id; never by email. */
export async function getCurrentAuthenticatedCustomer() {
  const identity = await readVerifiedCustomerIdentity();
  return prisma.customer.findUnique({
    where: { supabaseUserId: identity.supabaseUserId },
  });
}

/**
 * Race-safe account provisioning and verified-email synchronization.
 * The unique supabaseUserId constraint is the conflict target; an email match
 * alone can never claim or merge a Customer.
 */
export async function getOrCreateCurrentCustomer() {
  const identity = await readVerifiedCustomerIdentity();
  return upsertVerifiedCustomer(identity);
}

/** Internal server-only primitive; caller must obtain identity from verified Supabase Auth, never request email. */
export async function upsertVerifiedCustomer(identity: VerifiedCustomerIdentity, db: Pick<Prisma.TransactionClient, "customer"> = prisma) {
  const syncedAt = new Date();

  return db.customer.upsert({
    where: { supabaseUserId: identity.supabaseUserId },
    create: {
      supabaseUserId: identity.supabaseUserId,
      email: identity.email,
      emailNormalized: identity.emailNormalized,
      emailVerifiedAt: identity.emailVerifiedAt,
      emailSyncedAt: syncedAt,
    },
    update: {
      email: identity.email,
      emailNormalized: identity.emailNormalized,
      emailVerifiedAt: identity.emailVerifiedAt,
      emailSyncedAt: syncedAt,
    },
  });
}

/** Ownership-safe relationship lookup for the currently authenticated customer. */
export async function getCurrentCustomerStudentRelation(studentId: string) {
  const customer = await getCurrentAuthenticatedCustomer();
  if (!customer || customer.status !== "ACTIVE" || customer.archivedAt) return null;

  return prisma.customerStudentRelation.findUnique({
    where: {
      customerId_studentId: {
        customerId: customer.id,
        studentId,
      },
    },
  });
}
