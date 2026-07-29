import { NextRequest, NextResponse } from "next/server";
import { createCharge } from "@/lib/omise";
import { getPublicOrigin } from "@/lib/line";
import { clientIpFromRequest, consumeRateLimit } from "@/lib/rate-limit";
import { loadOwnedTicketBooking, ticketFeeInfo } from "@/lib/ticket-fee";

export const runtime = "nodejs";

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min

// POST /api/v1/public/payments/ticket-fee/charge  { nonce, bookingCode }
// Charges the ค่าบัตร (ฝากจ่าย) for a booking in TRANSFERRING_TICKET. The amount
// is read server-side from the admin's latest ticket-payment notice — never
// trusting the client — and stashed in the charge metadata so the webhook /
// confirm can settle the booking (see finalizeTicketFeeCharge).
export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const rl = consumeRateLimit(
    `ticket-fee-charge:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "ทำรายการบ่อยเกินไป กรุณาลองใหม่ภายหลัง" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const nonce = typeof record.nonce === "string" ? record.nonce.trim() : "";
  const bookingCode =
    typeof record.bookingCode === "string" ? record.bookingCode.trim() : "";

  if (!nonce || !/^(tokn|src)/.test(nonce)) {
    return NextResponse.json({ message: "ไม่พบข้อมูลการชำระเงิน" }, { status: 400 });
  }
  if (!bookingCode) {
    return NextResponse.json({ message: "ไม่พบรายการจอง" }, { status: 400 });
  }

  // Ownership is enforced here (loadOwnedTicketBooking returns null without a
  // valid LINE session or when the booking isn't the caller's).
  const booking = await loadOwnedTicketBooking(req, bookingCode);
  if (!booking) {
    return NextResponse.json(
      { message: "ไม่พบรายการจอง หรือกรุณาเข้าสู่ระบบด้วย LINE ก่อน" },
      { status: 404 },
    );
  }

  const info = ticketFeeInfo(booking);
  if (!info.payable) {
    return NextResponse.json(
      { message: "รายการนี้ยังไม่อยู่ในสถานะที่ต้องชำระค่าบัตร" },
      { status: 409 },
    );
  }

  const amountSatang = Math.round(info.amountBaht * 100);
  if (amountSatang <= 0) {
    return NextResponse.json({ message: "ยอดค่าบัตรไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const origin = getPublicOrigin(req);
    const charge = await createCharge({
      nonce,
      amount: amountSatang,
      returnUri: `${origin}/payments/ticket/${encodeURIComponent(bookingCode)}?omise_return=1`,
      metadata: {
        bookingCode,
        kind: "ticket_fee",
        ticketFeeBaht: String(info.amountBaht),
      },
    });
    return NextResponse.json({ data: { ...charge, bookingCode } });
  } catch (err) {
    console.error("ticket-fee charge error:", err);
    return NextResponse.json(
      {
        message:
          err instanceof Error ? err.message : "สร้างรายการชำระเงินไม่สำเร็จ",
      },
      { status: 502 },
    );
  }
}
