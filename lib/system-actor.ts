/**
 * Resolves the dedicated non-login "system" user used as the audit actor for
 * storefront-driven writes (BookingStatusLog.changedBy is NOT NULL, but a
 * customer cancelling their own queue is not an admin user).
 *
 * The row is seeded by the admin migration 20260728161800_add_omise_integration
 * (email = SYSTEM_ACTOR_EMAIL, isActive = false) — this mirrors
 * yoye-admin/lib/omise/system-actor.ts.
 */

import { prisma } from "./db";

export const SYSTEM_ACTOR_EMAIL = "system@yoye.internal";

let cachedId: number | null = null;

export async function getSystemActorId(): Promise<number> {
  if (cachedId != null) return cachedId;
  const user = await prisma.user.findUnique({
    where: { email: SYSTEM_ACTOR_EMAIL },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      `System actor "${SYSTEM_ACTOR_EMAIL}" not found — seeded by the yoye-admin migration 20260728161800_add_omise_integration`,
    );
  }
  cachedId = user.id;
  return cachedId;
}
