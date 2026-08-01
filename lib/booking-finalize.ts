import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { retrieveCharge } from "@/lib/omise";
import {
  buildBookingConfirmedMessage,
  buildTicketPaymentReviewMessage,
  pushLineTextMessage,
} from "@/lib/line-push";
import { recordOmisePayment } from "@/lib/payment-record";

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

  // Idempotency: already created? The payment record is still (re)written — the
  // upsert is keyed on the charge id, so this heals a booking whose slip write
  // failed the first time round without ever duplicating it.
  const existing = await prisma.booking.findUnique({
    where: { bookingCode },
    select: { id: true },
  });
  if (existing) {
    await recordOmisePayment({
      bookingId: existing.id,
      type: "DEPOSIT_PAID",
      charge,
      systemAmountBaht: depositPaid,
    });
    return { ok: true, bookingCode, created: false };
  }

  const items =
    payload.type === "TICKET" && payload.items?.length
      ? payload.items.map((i) => ({
          roundId: i.roundId,
          zoneId: i.zoneId,
          quantity: i.quantity,
        }))
      : [{ roundId: null, zoneId: null, quantity: payload.count ?? 1 }];

  let bookingId: number;
  try {
    bookingId = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          bookingCode,
          eventId,
          customerId,
          nameCustomer: payload.nameCustomer ?? undefined,
          // Deposit settled via Omise → the queue is confirmed outright. There is
          // no admin-approval step, so the booking lands on QUEUE_BOOKED
          // (the customer gets a "จองคิวสำเร็จ" LINE below).
          status: "QUEUE_BOOKED",
          paymentStatus: "PAID",
          depositPaid,
          notes: payload.notes ?? undefined,
          bookingItems: { create: items },
        },
        select: { id: true },
      });
      // Persist the customer's contact phone collected at booking time.
      if (payload.phone) {
        await tx.customer.update({
          where: { id: customerId },
          data: { phone: payload.phone },
        });
      }
      return created.id;
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

  // Ledger row for /payments (ประเภท "มัดจำ"). Best-effort — the booking itself
  // is already committed above.
  await recordOmisePayment({
    bookingId,
    type: "DEPOSIT_PAID",
    charge,
    systemAmountBaht: depositPaid,
  });

  // First (and only) creator notifies the customer that the queue is confirmed.
  // Best-effort — a LINE failure must not fail the booking, and it only runs on
  // genuine creation so the webhook + client confirm race can't double-send.
  await notifyBookingConfirmed(bookingCode, eventId, customerId);

  return { ok: true, bookingCode, created: true };
}

/** Send the "จองคิวสำเร็จ" LINE push. Never throws. */
async function notifyBookingConfirmed(
  bookingCode: string,
  eventId: number,
  customerId: number,
): Promise<void> {
  try {
    const [customer, event] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { lineUserId: true },
      }),
      prisma.event.findUnique({
        where: { id: eventId },
        select: { name: true },
      }),
    ]);
    if (!customer?.lineUserId) return; // customer hasn't linked LINE — nothing to push
    await pushLineTextMessage(
      customer.lineUserId,
      buildBookingConfirmedMessage({
        bookingId: bookingCode,
        eventName: event?.name ?? "-",
      }),
    );
  } catch (err) {
    console.error("notifyBookingConfirmed error:", err);
  }
}

/**
 * Apply a paid Omise **service-fee** (ค่ากด) charge to an EXISTING booking.
 * Unlike the deposit flow (which creates a booking), the booking already exists
 * here — a FORM booking that reached FORM_HAS_NAME (มีรายชื่อ). On a genuinely
 * paid charge we mark it COMPLETED and record the payment.
 *
 * The charge is re-fetched from Omise (never trusting the caller) and the amount
 * is read from the charge metadata we set at creation — itself computed
 * server-side — so the client can never dictate the paid amount.
 *
 * Idempotent + race-safe: the status transition is a guarded `updateMany` on
 * `status = FORM_HAS_NAME`, so a duplicate call (webhook + client confirm) only
 * increments `totalPaid` once.
 */
export async function finalizeServiceFeeCharge(
  chargeId: string,
): Promise<FinalizeResult> {
  const charge = await retrieveCharge(chargeId);
  if (!(charge.paid && charge.status === "successful")) {
    return { ok: false, reason: "not_paid" };
  }

  const m = charge.metadata;
  const bookingCode = m.bookingCode;
  const amountBaht = Number(m.serviceFeeBaht ?? 0);
  if (
    m.kind !== "service_fee" ||
    !bookingCode ||
    !Number.isFinite(amountBaht) ||
    amountBaht <= 0
  ) {
    return { ok: false, reason: "bad_metadata" };
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingCode },
    select: { id: true, status: true },
  });
  if (!booking) return { ok: false, reason: "bad_metadata" };

  // Already applied by a concurrent webhook/confirm → the booking is settled, but
  // still (re)write the ledger row: the upsert is keyed on the charge id, so a
  // slip that failed to write on the first pass heals here instead of leaving
  // the payment invisible in /payments.
  if (booking.status === "SERVICE_FEE_PAID" || booking.status === "COMPLETED") {
    await recordOmisePayment({
      bookingId: booking.id,
      type: "SERVICE_PAID",
      charge,
      systemAmountBaht: amountBaht,
    });
    return { ok: true, bookingCode, created: false };
  }

  // Guarded transition: only the first caller (status still
  // WAITING_SERVICE_FEE_VERIFY, i.e. the admin billed but payment not yet
  // applied) settles the ค่ากด, so totalPaid is never double-counted.
  const res = await prisma.booking.updateMany({
    where: { id: booking.id, status: "WAITING_SERVICE_FEE_VERIFY" },
    data: {
      status: "SERVICE_FEE_PAID",
      paymentStatus: "PAID",
      serviceFee: amountBaht,
      totalPaid: { increment: amountBaht },
    },
  });

  // Ledger row for /payments (ประเภท "ค่ากด/ค่าบริการ").
  await recordOmisePayment({
    bookingId: booking.id,
    type: "SERVICE_PAID",
    charge,
    systemAmountBaht: amountBaht,
  });

  return { ok: true, bookingCode, created: res.count > 0 };
}

/**
 * Apply a paid Omise **ticket** (ค่าบัตร / ฝากจ่าย) charge to an EXISTING booking.
 * The booking is in TRANSFERRING_TICKET ("โอนค่าบัตร (กรณีฝากร้าน)"); on a
 * genuinely paid charge we advance it to CONFIRMING_TICKET ("ยืนยันโอนค่าบัตร")
 * so the admin confirms, and record the payment. The amount is read from the
 * charge metadata (set server-side at creation) so the client can't dictate it.
 *
 * Idempotent + race-safe: the transition is a guarded `updateMany` on
 * `status = TRANSFERRING_TICKET`, so a duplicate call (webhook + client confirm)
 * only increments `totalPaid` once.
 */
export async function finalizeTicketFeeCharge(
  chargeId: string,
): Promise<FinalizeResult> {
  const charge = await retrieveCharge(chargeId);
  if (!(charge.paid && charge.status === "successful")) {
    return { ok: false, reason: "not_paid" };
  }

  const m = charge.metadata;
  const bookingCode = m.bookingCode;
  const amountBaht = Number(m.ticketFeeBaht ?? 0);
  if (
    m.kind !== "ticket_fee" ||
    !bookingCode ||
    !Number.isFinite(amountBaht) ||
    amountBaht <= 0
  ) {
    return { ok: false, reason: "bad_metadata" };
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingCode },
    select: { id: true, status: true },
  });
  if (!booking) return { ok: false, reason: "bad_metadata" };

  // Already applied by a concurrent webhook/confirm → the booking is settled, but
  // still (re)write the ledger row (idempotent upsert on the charge id) so a slip
  // that failed to write on the first pass heals instead of staying invisible.
  if (booking.status === "CONFIRMING_TICKET" || booking.status === "COMPLETED") {
    await recordOmisePayment({
      bookingId: booking.id,
      type: "CARD_PAID",
      charge,
      systemAmountBaht: amountBaht,
    });
    return { ok: true, bookingCode, created: false };
  }

  // Guarded transition: only the first caller (status still TRANSFERRING_TICKET)
  // settles the ค่าบัตร, so totalPaid is never double-counted.
  const res = await prisma.booking.updateMany({
    where: { id: booking.id, status: "TRANSFERRING_TICKET" },
    data: {
      status: "CONFIRMING_TICKET",
      paymentStatus: "PAID",
      netCardPrice: amountBaht,
      totalPaid: { increment: amountBaht },
    },
  });

  // Ledger row for /payments (ประเภท "ค่าบัตร/สินค้า").
  await recordOmisePayment({
    bookingId: booking.id,
    type: "CARD_PAID",
    charge,
    systemAmountBaht: amountBaht,
  });

  // Only the first (genuine) settler notifies, so a webhook + client-confirm race
  // can't double-send the "ตรวจสอบยอดโอน" LINE message.
  if (res.count > 0) {
    await notifyTicketPaymentReview(bookingCode, amountBaht);
  }

  return { ok: true, bookingCode, created: res.count > 0 };
}

/** Send the "ตรวจสอบยอดโอนค่าบัตร" LINE push. Never throws. */
async function notifyTicketPaymentReview(
  bookingCode: string,
  amount: number,
): Promise<void> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { bookingCode },
      select: {
        customer: { select: { lineUserId: true } },
        event: { select: { name: true } },
      },
    });
    const lineUserId = booking?.customer?.lineUserId;
    if (!lineUserId) return; // customer hasn't linked LINE — nothing to push
    await pushLineTextMessage(
      lineUserId,
      buildTicketPaymentReviewMessage({
        bookingId: bookingCode,
        eventName: booking?.event?.name ?? "-",
        amount,
      }),
    );
  } catch (err) {
    console.error("notifyTicketPaymentReview error:", err);
  }
}
