import { NextRequest, NextResponse } from "next/server";
import { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { getSystemActorId } from "@/lib/system-actor";
import { canCancelBooking, cancellableStatuses } from "@/app/tracking/status-map";
import { forfeitRemainingDeposit } from "@/lib/deposit-forfeit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_NOT_FOUND = "ไม่พบข้อมูลการจอง";
const TOO_LATE =
  "รายการนี้เริ่มดำเนินการแล้ว ไม่สามารถยกเลิกเองได้ กรุณาติดต่อแอดมิน";

// POST /api/v1/public/bookings/:code/cancel
// Cancel the caller's own queue. Requires a LINE session + ownership, and only
// works before pressing starts. The deposit is forfeited — the shop's terms say
// a customer-initiated cancellation is never refunded — so the whole remaining
// deposit is written to the ledger as ยึดมัดจำ here and now, and the booking
// lands on DEPOSIT_FORFEITED. That is the same end state yoye-admin's
// recomputeDeposit produces when an admin cancels the queue, which is what puts
// the row on the admin's "มัดจำ" page instead of waiting for someone to settle
// it by hand.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { message: "กรุณาเข้าสู่ระบบด้วย LINE ก่อน" },
      { status: 401 }
    );
  }

  const { code } = await params;
  const bookingCode = decodeURIComponent(code).trim();
  if (!bookingCode) {
    return NextResponse.json({ message: GENERIC_NOT_FOUND }, { status: 404 });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { bookingCode },
      select: {
        id: true,
        eventId: true,
        status: true,
        depositPaid: true,
        deletedAt: true,
        customer: { select: { lineUserId: true } },
      },
    });
    if (
      !booking ||
      booking.deletedAt ||
      booking.customer.lineUserId !== user.sub
    ) {
      return NextResponse.json({ message: GENERIC_NOT_FOUND }, { status: 404 });
    }

    // Already cancelled by a double-submit / a second tab → treat as success.
    // DEPOSIT_FORFEITED counts as cancelled too: it is where a cancellation
    // lands once the deposit has been settled.
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.DEPOSIT_FORFEITED
    ) {
      return NextResponse.json({ data: { ok: true } });
    }

    if (!canCancelBooking(booking.status)) {
      return NextResponse.json({ message: TOO_LATE }, { status: 409 });
    }

    const systemActorId = await getSystemActorId();

    // Guarded transition: only the first caller flips the status, so a
    // double-submit can't write two status-log rows.
    const cancelled = await prisma.$transaction(async (tx) => {
      const res = await tx.booking.updateMany({
        where: { id: booking.id, status: { in: cancellableStatuses() } },
        data: { status: BookingStatus.CANCELLED },
      });
      if (res.count === 0) return false;
      await tx.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          changedBy: systemActorId,
          status: BookingStatus.CANCELLED,
          notes: "ลูกค้ายกเลิกคิวเองผ่านหน้าติดตามสถานะ (ยึดมัดจำ)",
        },
      });

      // ยึดมัดจำก้อนที่เหลือทันที ไม่ต้องรอแอดมินมากดเอง (ส่วนที่ถูกยึดไปแล้วจาก
      // การยกเลิกทีละใบจะไม่ถูกนับซ้ำ — ดู lib/deposit-forfeit.ts)
      const forfeited = await forfeitRemainingDeposit(tx, {
        bookingId: booking.id,
        eventId: booking.eventId,
        depositPaid: booking.depositPaid,
      });
      if (forfeited > 0) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.DEPOSIT_FORFEITED },
        });
        await tx.bookingStatusLog.create({
          data: {
            bookingId: booking.id,
            changedBy: systemActorId,
            status: BookingStatus.DEPOSIT_FORFEITED,
            notes: `ระบบยึดมัดจำอัตโนมัติ ฿${forfeited.toLocaleString("th-TH")} — ลูกค้ายกเลิกคิวเอง`,
          },
        });
      }
      return true;
    });

    // Lost the race to another submit that already cancelled it — same outcome.
    if (!cancelled) {
      const current = await prisma.booking.findUnique({
        where: { id: booking.id },
        select: { status: true },
      });
      if (
        current?.status !== BookingStatus.CANCELLED &&
        current?.status !== BookingStatus.DEPOSIT_FORFEITED
      ) {
        return NextResponse.json({ message: TOO_LATE }, { status: 409 });
      }
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("public/bookings cancel error:", err);
    return NextResponse.json(
      { message: "ยกเลิกการจองไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
