import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
// Counts change slowly and the page is public — cache so a burst of visitors
// doesn't turn into a burst of COUNT queries over the whole bookings table.
const CACHE_SECONDS = 60;
const CACHE_CONTROL = `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`;
export const revalidate = 60;

export interface ReviewStatsDTO {
  /** Unique cookies that have ever hit the storefront (see /public/visits). */
  totalVisitors: number;
  /** Bookings that were not cancelled. */
  totalBookings: number;
  /** Bookings that reached a "we got the tickets" state or later. */
  successPresses: number;
}

/** Cancelled queues never count as a booking. */
const CANCELLED_STATUSES: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.CLOSED_REFUNDED,
];

/**
 * Statuses that mean the team actually secured tickets/a name — everything from
 * the moment tickets are in hand through to a completed order.
 */
const SUCCESS_STATUSES: BookingStatus[] = [
  BookingStatus.PARTIALLY_BOOKED,
  BookingStatus.FULLY_BOOKED,
  BookingStatus.TEAM_BOOKED,
  BookingStatus.PARTIAL_SELF_TEAM_BOOKING,
  BookingStatus.CUSTOMER_SELF_BOOKED,
  BookingStatus.FORM_HAS_NAME,
  BookingStatus.WAITING_SUMMARY,
  BookingStatus.WAITING_SERVICE_FEE,
  BookingStatus.WAITING_SERVICE_FEE_VERIFY,
  BookingStatus.SERVICE_FEE_PAID,
  BookingStatus.COMPLETED,
];

const getStats = unstable_cache(
  async (): Promise<ReviewStatsDTO> => {
    const [totalVisitors, totalBookings, successPresses] = await Promise.all([
      prisma.siteVisitor.count(),
      prisma.booking.count({
        where: { deletedAt: null, status: { notIn: CANCELLED_STATUSES } },
      }),
      prisma.booking.count({
        where: { deletedAt: null, status: { in: SUCCESS_STATUSES } },
      }),
    ]);
    return { totalVisitors, totalBookings, successPresses };
  },
  ["public-review-stats"],
  { revalidate: CACHE_SECONDS, tags: ["review-stats"] },
);

// GET /api/v1/public/reviews/stats
export async function GET() {
  try {
    const data = await getStats();
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch (err) {
    console.error("public/reviews/stats error:", err);
    return NextResponse.json(
      { message: "ไม่สามารถโหลดสถิติได้" },
      { status: 500 },
    );
  }
}
