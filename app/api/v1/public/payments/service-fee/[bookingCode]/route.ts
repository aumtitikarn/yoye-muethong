import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { loadOwnedBooking, serviceFeeInfo } from "@/lib/service-fee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = "ไม่พบข้อมูลการจอง";

// GET /api/v1/public/payments/service-fee/:bookingCode
// Returns the ค่ากด amount + payability for the caller's own booking.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingCode: string }> },
) {
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { message: "กรุณาเข้าสู่ระบบด้วย LINE ก่อน" },
      { status: 401 },
    );
  }

  const { bookingCode: raw } = await params;
  const bookingCode = decodeURIComponent(raw).trim();
  if (!bookingCode) {
    return NextResponse.json({ message: NOT_FOUND }, { status: 404 });
  }

  try {
    const booking = await loadOwnedBooking(req, bookingCode);
    if (!booking) {
      return NextResponse.json({ message: NOT_FOUND }, { status: 404 });
    }
    return NextResponse.json({ data: serviceFeeInfo(booking) });
  } catch (err) {
    console.error("service-fee info error:", err);
    return NextResponse.json(
      { message: "ไม่สามารถโหลดข้อมูลการจองได้" },
      { status: 500 },
    );
  }
}
