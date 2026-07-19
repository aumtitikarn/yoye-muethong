import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { finalizeChargeToBooking } from "@/lib/booking-finalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/public/payments/omise/confirm  { chargeId }
// Called by the client once polling sees the charge as paid, so the booking is
// recorded even if the Omise webhook isn't configured (e.g. local/test). Safe:
// the charge is re-verified against Omise inside finalizeChargeToBooking, and
// creation is idempotent, so a duplicate webhook won't double-book.
export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const chargeId =
    typeof (body as Record<string, unknown>)?.chargeId === "string"
      ? ((body as Record<string, string>).chargeId).trim()
      : "";
  if (!/^chrg_/.test(chargeId)) {
    return NextResponse.json({ message: "ไม่พบรายการชำระเงิน" }, { status: 400 });
  }

  try {
    const result = await finalizeChargeToBooking(chargeId);
    if (!result.ok) {
      const status = result.reason === "not_paid" ? 409 : 400;
      return NextResponse.json(
        {
          message:
            result.reason === "not_paid"
              ? "ยังไม่พบการชำระเงินที่สำเร็จ"
              : "ข้อมูลการชำระเงินไม่ครบถ้วน",
        },
        { status }
      );
    }
    return NextResponse.json({
      data: { bookingCode: result.bookingCode, created: result.created },
    });
  } catch (err) {
    console.error("omise confirm error:", err);
    return NextResponse.json(
      { message: "บันทึกการจองไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
