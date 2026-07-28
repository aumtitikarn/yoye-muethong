import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Info the /payments/[bookingCode] page needs to render the ค่ากด checkout.
export interface ServiceFeeInfoDTO {
  bookingCode: string;
  eventName: string;
  quantity: number;
  feePerEntry: number;
  amountBaht: number;
  /** True only when the booking is in a state where ค่ากด can be paid. */
  payable: boolean;
  /** True once the service fee has already been settled. */
  alreadyPaid: boolean;
  status: string;
}

export const serviceFeeBookingSelect = {
  bookingCode: true,
  status: true,
  deletedAt: true,
  customer: { select: { lineUserId: true } },
  event: { select: { name: true, type: true, feePerEntry: true } },
  bookingItems: { select: { quantity: true } },
  // Latest bill created by the admin — its finalAmount is the exact ค่ากด due.
  fulfillment: {
    select: {
      billLogs: {
        select: { finalAmount: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  },
} satisfies Prisma.BookingSelect;

export type ServiceFeeBookingRow = Prisma.BookingGetPayload<{
  select: typeof serviceFeeBookingSelect;
}>;

/**
 * Shared amount rule: ค่ากด = feePerEntry × จำนวนรายชื่อ. Kept in one place so
 * the GET (display) and the POST charge (billing) can never diverge, and so the
 * client can never dictate the amount.
 */
export function serviceFeeInfo(b: ServiceFeeBookingRow): ServiceFeeInfoDTO {
  const quantity = Math.max(
    1,
    b.bookingItems.reduce((s, i) => s + i.quantity, 0),
  );
  const feePerEntry = b.event.feePerEntry ? Number(b.event.feePerEntry) : 0;
  // The customer pays the exact amount the admin billed (finalAmount of the
  // latest bill), not a recomputed feePerEntry × quantity. The bill nets out
  // deposits, partial fills and VAT, so it is the single source of truth.
  const amountBaht = b.fulfillment?.billLogs[0]?.finalAmount ?? 0;

  return {
    bookingCode: b.bookingCode,
    eventName: b.event.name,
    quantity,
    feePerEntry,
    amountBaht,
    // Payable once the admin has created the bill (สร้างบิล → รอตรวจสลิปค่ากด),
    // for both FORM and TICKET events — the bill amount is what's owed.
    payable: b.status === "WAITING_SERVICE_FEE_VERIFY" && amountBaht > 0,
    alreadyPaid: b.status === "SERVICE_FEE_PAID" || b.status === "COMPLETED",
    status: b.status,
  };
}

/**
 * Load the caller's own booking (LINE session + ownership) for service-fee
 * flows, or null when unauthenticated / not the owner / not found.
 */
export async function loadOwnedBooking(
  req: NextRequest,
  bookingCode: string,
): Promise<ServiceFeeBookingRow | null> {
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return null;
  const booking = await prisma.booking.findUnique({
    where: { bookingCode },
    select: serviceFeeBookingSelect,
  });
  if (!booking || booking.deletedAt || booking.customer.lineUserId !== user.sub) {
    return null;
  }
  return booking;
}
