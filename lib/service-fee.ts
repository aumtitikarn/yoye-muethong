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
  const amountBaht = feePerEntry * quantity;
  const isForm = b.event.type === "FORM";

  return {
    bookingCode: b.bookingCode,
    eventName: b.event.name,
    quantity,
    feePerEntry,
    amountBaht,
    payable: isForm && b.status === "FORM_HAS_NAME" && amountBaht > 0,
    alreadyPaid: b.status === "COMPLETED",
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
