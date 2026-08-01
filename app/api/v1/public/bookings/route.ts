import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { canCancelBooking, toTrackingStatus } from "@/app/tracking/status-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A tracking row as consumed by /tracking (paymentDeadline serialised as ISO).
export interface TrackingRowDTO {
  bookingId: string;
  concertName: string;
  showTime: string;
  zone: string;
  status: string; // a TrackingStatus enum value
  paymentDeadline: string | null;
  totalPrice: number;
  /** True when the customer has already saved extra-field answers for this booking. */
  haveDeepInfo: boolean;
  /** True when the customer has already submitted refund bank info for this booking. */
  haveRefundInfo: boolean;
  /** True while the customer may still cancel this queue themselves (deposit forfeited). */
  canCancel: boolean;
}

const bookingSelect = {
  bookingCode: true,
  status: true,
  netCardPrice: true,
  serviceFee: true,
  shippingFee: true,
  vatAmount: true,
  createdAt: true,
  event: {
    select: {
      name: true,
      type: true,
      eventDate: true,
      deepInfoFields: { select: { id: true, isRequired: true } },
    },
  },
  bookingItems: {
    select: {
      quantity: true,
      round: { select: { date: true, time: true, name: true } },
      zone: { select: { name: true } },
    },
  },
  deepInfoResponses: { select: { fieldId: true, entryIndex: true } },
  _count: { select: { refundRequests: true } },
} satisfies Prisma.BookingSelect;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

const thaiDate = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

function showTimeLabel(b: BookingRow): string {
  const round = b.bookingItems.find((i) => i.round)?.round;
  if (round) {
    return `${thaiDate.format(round.date)}${round.time ? ` - ${round.time}` : ""}`;
  }
  if (b.event.eventDate) return thaiDate.format(b.event.eventDate);
  return "-";
}

function zoneLabel(b: BookingRow): string {
  const names = Array.from(
    new Set(
      b.bookingItems
        .map((i) => i.zone?.name)
        .filter((n): n is string => Boolean(n)),
    ),
  );
  if (names.length > 0) return names.join(", ");
  return b.event.type === "FORM" ? "รายชื่อ" : "-";
}

function toDTO(b: BookingRow): TrackingRowDTO {
  return {
    bookingId: b.bookingCode,
    concertName: b.event.name,
    showTime: showTimeLabel(b),
    zone: zoneLabel(b),
    status: toTrackingStatus(b.status),
    // The admin schema has no per-booking payment deadline, so no urgent card.
    paymentDeadline: null,
    totalPrice:
      b.netCardPrice + b.serviceFee + b.shippingFee + b.vatAmount,
    haveDeepInfo: isDeepInfoComplete(b),
    haveRefundInfo: b._count.refundRequests > 0,
    canCancel: canCancelBooking(b.status),
  };
}

/**
 * True only when every booked name/ticket has an answer for every REQUIRED
 * field — a booking for 3 รายชื่อ with only the first one filled still needs
 * attention, so the tracking page keeps showing "กรอกข้อมูลการจองเพิ่มเติม".
 *
 * Optional fields are excluded: they are legitimately left blank, and since
 * blank answers are deleted rather than stored, counting them would make such
 * bookings look permanently incomplete. Mirrors the rule in the deep-info save
 * route that decides BOOKING_INFO_SUBMITTED.
 */
function isDeepInfoComplete(b: BookingRow): boolean {
  const requiredIds = new Set(
    b.event.deepInfoFields.filter((f) => f.isRequired).map((f) => f.id),
  );
  if (requiredIds.size === 0) return true;
  const entryCount = Math.max(
    1,
    b.bookingItems.reduce((s, i) => s + i.quantity, 0),
  );
  const filled = b.deepInfoResponses.filter((r) =>
    requiredIds.has(r.fieldId),
  ).length;
  return filled >= requiredIds.size * entryCount;
}

// GET /api/v1/public/bookings
// Returns the logged-in (LINE) customer's real bookings for the tracking page.
export async function GET(req: NextRequest) {
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { message: "กรุณาเข้าสู่ระบบด้วย LINE ก่อน" },
      { status: 401 }
    );
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { lineUserId: user.sub },
      select: { id: true },
    });
    // No linked customer yet → no bookings (not an error).
    if (!customer) {
      return NextResponse.json({ data: [] });
    }

    const bookings = await prisma.booking.findMany({
      where: { customerId: customer.id, deletedAt: null, isActive: true },
      orderBy: { createdAt: "desc" },
      select: bookingSelect,
    });
    return NextResponse.json({ data: bookings.map(toDTO) });
  } catch (err) {
    console.error("public/bookings error:", err);
    return NextResponse.json(
      { message: "ไม่สามารถโหลดข้อมูลการจองได้" },
      { status: 500 }
    );
  }
}
