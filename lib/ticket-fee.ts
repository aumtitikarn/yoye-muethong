import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Info the /payments/ticket/[bookingCode] page needs to render the ค่าบัตร
// (ฝากจ่าย) checkout. Amount + due date come from the latest TicketPaymentRequest
// the admin sent ("แจ้งยอดโอนค่าบัตร").
export interface TicketFeeInfoDTO {
  bookingCode: string;
  eventName: string;
  showDateTime: string | null;
  ticketZone: string | null;
  ticketQty: string | null;
  amountBaht: number;
  dueAt: string | null;
  dueText: string | null;
  /** True only when the booking is in a state where ค่าบัตร can be paid. */
  payable: boolean;
  /** True once the ticket payment has already been settled. */
  alreadyPaid: boolean;
  status: string;
}

export const ticketFeeBookingSelect = {
  bookingCode: true,
  status: true,
  deletedAt: true,
  customer: { select: { lineUserId: true } },
  event: { select: { name: true } },
  // Proof that the ค่าบัตร actually landed. `status` alone can't answer this:
  // it is a moving pipeline position, and the booking leaves CONFIRMING_TICKET
  // as soon as the admin confirms the transfer.
  paymentSlips: {
    where: { type: "CARD_PAID", status: "VERIFIED" },
    select: { id: true },
    take: 1,
  },
  // The other durable trace: a manual bank transfer confirmed by the admin moves
  // the booking to CONFIRMING_TICKET and logs it, but writes no payment_slips row.
  statusLogs: {
    where: { status: "CONFIRMING_TICKET" },
    select: { id: true },
    take: 1,
  },
  // Latest ticket-payment notice set by the admin — its amount is what's owed.
  ticketPaymentRequests: {
    orderBy: { sentAt: "desc" },
    take: 1,
    select: {
      amount: true,
      dueAt: true,
      dueText: true,
      eventName: true,
      showDateTime: true,
      ticketZone: true,
      ticketQty: true,
    },
  },
} satisfies Prisma.BookingSelect;

export type TicketFeeBookingRow = Prisma.BookingGetPayload<{
  select: typeof ticketFeeBookingSelect;
}>;

/**
 * Amount rule: ค่าบัตร = the admin-set amount on the latest TicketPaymentRequest.
 * Kept in one place so the GET (display) and the POST charge (billing) never
 * diverge, and so the client can never dictate the amount.
 */
export function ticketFeeInfo(b: TicketFeeBookingRow): TicketFeeInfoDTO {
  const latest = b.ticketPaymentRequests[0];
  const amountBaht = latest?.amount != null ? Number(latest.amount) : 0;

  // Payable while the booking sits in "โอนค่าบัตร (กรณีฝากร้าน)" and the admin
  // has set an amount to pay.
  const payable = b.status === "TRANSFERRING_TICKET" && amountBaht > 0;
  // Settled = a verified ค่าบัตร slip exists (Omise charge or an admin-approved
  // bank transfer), or the booking is sitting on one of the two statuses that
  // only follow payment. The slip is the durable half: statuses past
  // CONFIRMING_TICKET (ยืนยันแล้ว → กดบัตร → สรุปยอด …) used to read as
  // "รอดำเนินการ" even though the money was in.
  // `payable` still wins — if the admin re-opened the transfer step, the
  // customer owes something now and must get the ชำระเงิน button back.
  const alreadyPaid =
    !payable &&
    (b.paymentSlips.length > 0 ||
      b.statusLogs.length > 0 ||
      b.status === "CONFIRMING_TICKET" ||
      b.status === "COMPLETED");

  return {
    bookingCode: b.bookingCode,
    eventName: latest?.eventName ?? b.event.name,
    showDateTime: latest?.showDateTime ?? null,
    ticketZone: latest?.ticketZone ?? null,
    ticketQty: latest?.ticketQty ?? null,
    amountBaht,
    dueAt: latest?.dueAt ? latest.dueAt.toISOString() : null,
    dueText: latest?.dueText ?? null,
    payable,
    alreadyPaid,
    status: b.status,
  };
}

/**
 * Load the caller's own booking (LINE session + ownership) for the ticket-fee
 * flow, or null when unauthenticated / not the owner / not found.
 */
export async function loadOwnedTicketBooking(
  req: NextRequest,
  bookingCode: string,
): Promise<TicketFeeBookingRow | null> {
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return null;
  const booking = await prisma.booking.findUnique({
    where: { bookingCode },
    select: ticketFeeBookingSelect,
  });
  if (!booking || booking.deletedAt || booking.customer.lineUserId !== user.sub) {
    return null;
  }
  return booking;
}
