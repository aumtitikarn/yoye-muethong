import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { retrieveCharge } from "@/lib/omise";

// Booking payload we stash in the Omise charge metadata at charge creation, so
// the paid charge carries everything needed to create the booking.
export interface ChargeBookingPayload {
  type: "FORM" | "TICKET";
  count?: number;
  items?: Array<{ roundId: number; zoneId: number; quantity: number }>;
  notes?: string;
  nameCustomer?: string;
  phone?: string;
}

export type FinalizeResult =
  | { ok: true; bookingCode: string; created: boolean }
  | { ok: false; reason: "not_paid" | "bad_metadata" };

function parsePayload(raw: string | undefined): ChargeBookingPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChargeBookingPayload;
  } catch {
    return null;
  }
}

/**
 * Create the real Booking for a paid Omise charge. Idempotent: the bookingCode
 * (unique) lives in the charge metadata, so calling this twice — once from the
 * webhook, once from the client confirm — creates the booking at most once.
 *
 * The charge is re-fetched from Omise here (never trusting a caller's word) and
 * must be genuinely paid + successful before anything is written.
 */
export async function finalizeChargeToBooking(
  chargeId: string,
): Promise<FinalizeResult> {
  const charge = await retrieveCharge(chargeId);
  if (!(charge.paid && charge.status === "successful")) {
    return { ok: false, reason: "not_paid" };
  }

  const m = charge.metadata;
  const bookingCode = m.bookingCode;
  const eventId = Number(m.eventId);
  const customerId = Number(m.customerId);
  const depositPaid = Number(m.depositBaht ?? 0);
  const payload = parsePayload(m.payload);
  if (!bookingCode || !Number.isInteger(eventId) || !Number.isInteger(customerId) || !payload) {
    return { ok: false, reason: "bad_metadata" };
  }

  // Idempotency: already created?
  const existing = await prisma.booking.findUnique({
    where: { bookingCode },
    select: { id: true },
  });
  if (existing) return { ok: true, bookingCode, created: false };

  const items =
    payload.type === "TICKET" && payload.items?.length
      ? payload.items.map((i) => ({
          roundId: i.roundId,
          zoneId: i.zoneId,
          quantity: i.quantity,
        }))
      : [{ roundId: null, zoneId: null, quantity: payload.count ?? 1 }];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.booking.create({
        data: {
          bookingCode,
          eventId,
          customerId,
          nameCustomer: payload.nameCustomer ?? undefined,
          status: "QUEUE_BOOKED",
          paymentStatus: "PAID",
          depositPaid,
          notes: payload.notes ?? undefined,
          bookingItems: { create: items },
        },
      });
      // Persist the customer's contact phone collected at booking time.
      if (payload.phone) {
        await tx.customer.update({
          where: { id: customerId },
          data: { phone: payload.phone },
        });
      }
    });
  } catch (err) {
    // Lost a race with the webhook/confirm creating the same bookingCode.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: true, bookingCode, created: false };
    }
    throw err;
  }

  return { ok: true, bookingCode, created: true };
}
