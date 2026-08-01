/**
 * Persists a settled Omise charge as a PaymentSlip row — the record the admin's
 * "สลิปและการเงิน" page (/payments) lists.
 *
 * The booking columns (depositPaid / netCardPrice / serviceFee / totalPaid) say
 * how much a booking has paid, but they carry no per-transaction history: no
 * charge id, no paid-at, no ประเภท breakdown. PaymentSlip is that ledger, and it
 * is what the admin finance views read. Manual bank transfers land there with an
 * uploaded slip image; an Omise charge lands there with `paymentMethod = OMISE`,
 * `status = VERIFIED` (the gateway already proved the payment — there is nothing
 * for an admin to eyeball), `imageUrl = null` and the charge id + paid time
 * instead of a slip picture.
 *
 * Idempotent by `omiseChargeId` (unique): the webhook and the client-side
 * confirm both call this for the same charge, and yoye-admin's own Omise webhook
 * upserts on the very same key — whoever gets there first wins, the rest update
 * in place. No duplicate rows, no double-counted money.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { OmiseChargeResult } from "@/lib/omise";
import { getSystemActorId } from "@/lib/system-actor";

export type PaymentRecordType = "DEPOSIT_PAID" | "CARD_PAID" | "SERVICE_PAID";

/** metadata.kind on the charge → the slip type the admin groups by. */
export function slipTypeForChargeKind(kind: string | undefined): PaymentRecordType {
  switch (kind) {
    case "ticket_fee":
      return "CARD_PAID";
    case "service_fee":
      return "SERVICE_PAID";
    default:
      // Deposit charges (the storefront's checkout) carry no `kind`.
      return "DEPOSIT_PAID";
  }
}

interface RecordInput {
  bookingId: number;
  type: PaymentRecordType;
  charge: OmiseChargeResult;
  /** ยอดที่ระบบคาดว่าต้องได้รับ (บาท) — ต่างจากยอดที่จ่ายจริงจะโชว์เตือนในแอดมิน. */
  systemAmountBaht: number;
}

/**
 * Write (or refresh) the PaymentSlip for a paid Omise charge.
 *
 * Best-effort on purpose: the customer's booking has already been settled by the
 * caller, and a bookkeeping failure must never turn a successful payment into an
 * error for the customer. A failure is logged and self-heals — the next webhook
 * retry / client confirm for the same charge re-runs this upsert.
 */
export async function recordOmisePayment(input: RecordInput): Promise<void> {
  const { bookingId, type, charge, systemAmountBaht } = input;
  const paidAmountBaht = Math.round((charge.amount / 100 + Number.EPSILON) * 100) / 100;
  const paidAt = charge.paidAt ? new Date(charge.paidAt) : new Date();

  try {
    const systemActorId = await getSystemActorId();

    await prisma.$transaction(async (tx) => {
      const slip = await tx.paymentSlip.upsert({
        where: { omiseChargeId: charge.id },
        create: {
          bookingId,
          type,
          status: "VERIFIED",
          paymentMethod: "OMISE",
          omiseChargeId: charge.id,
          systemAmount: systemAmountBaht,
          slipAmount: paidAmountBaht,
          imageUrl: null,
          paidAt,
          reviewerId: systemActorId,
          reviewedAt: new Date(),
          notes: `ชำระผ่าน Omise — ยืนยันอัตโนมัติ (charge ${charge.id})`,
        },
        update: {
          status: "VERIFIED",
          systemAmount: systemAmountBaht,
          slipAmount: paidAmountBaht,
          paidAt,
        },
      });

      // Only log the first transition, so a webhook + confirm race doesn't pile
      // up identical "VERIFIED" entries on the slip's history.
      const logged = await tx.paymentSlipLog.count({
        where: { paymentSlipId: slip.id },
      });
      if (logged === 0) {
        await tx.paymentSlipLog.create({
          data: {
            paymentSlipId: slip.id,
            changedById: systemActorId,
            status: "VERIFIED",
            note: `Omise charge ${charge.id}`,
          },
        });
      }
    });
  } catch (err) {
    // A concurrent caller inserting the same charge id is the expected race —
    // that row now exists, which is exactly the outcome we wanted.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return;
    }
    console.error(
      `recordOmisePayment error (charge ${charge.id}, booking ${bookingId}):`,
      err,
    );
  }
}
