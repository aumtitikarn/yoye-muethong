import { NextRequest, NextResponse } from "next/server";
import { createCharge } from "@/lib/omise";
import { getPublicOrigin } from "@/lib/line";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { generateUniqueBookingCode } from "@/lib/booking-code";
import type { ChargeBookingPayload } from "@/lib/booking-finalize";
import { clientIpFromRequest, consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const DEPOSIT_PER_ENTRY = 100; // ฿ per name/ticket — mirrors yoye-admin
const MAX_ENTRIES = 100;

// POST /api/v1/public/payments/omise/charge
// Requires a LINE session. Validates the booking selection, computes the
// deposit server-side (never trusting the client), generates the bookingCode
// up front, and stashes everything needed to create the booking in the charge
// metadata. The booking itself is created only once the charge is confirmed
// paid (see /confirm and the webhook → finalizeChargeToBooking).
export async function POST(req: NextRequest) {
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { message: "กรุณาเข้าสู่ระบบด้วย LINE ก่อนชำระเงิน" },
      { status: 401 }
    );
  }

  const ip = clientIpFromRequest(req);
  const rl = consumeRateLimit(
    `omise-charge:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "ทำรายการบ่อยเกินไป กรุณาลองใหม่ภายหลัง" },
      { status: 429 }
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
  const eventId = Number(record.eventId);
  const phone =
    typeof record.phone === "string" ? record.phone.replace(/\D/g, "") : "";

  if (!nonce || !/^(tokn|src)/.test(nonce)) {
    return NextResponse.json({ message: "ไม่พบข้อมูลการชำระเงิน" }, { status: 400 });
  }
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ message: "ไม่พบงานที่เลือก" }, { status: 400 });
  }
  if (!/^0\d{8,9}$/.test(phone)) {
    return NextResponse.json({ message: "กรุณากรอกเบอร์โทรให้ถูกต้อง" }, { status: 400 });
  }

  // Verify the event exists and read its type to validate the selection shape.
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null, isActive: true },
    select: { id: true, type: true },
  });
  if (!event) {
    return NextResponse.json({ message: "ไม่พบงานที่เลือก" }, { status: 404 });
  }

  // Build + validate the booking payload and compute total entries.
  let payload: ChargeBookingPayload;
  let totalEntries: number;
  const notes = typeof record.notes === "string" ? record.notes : undefined;
  const nameCustomer =
    typeof record.nameCustomer === "string" ? record.nameCustomer : undefined;

  if (event.type === "FORM") {
    const count = Number(record.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_ENTRIES) {
      return NextResponse.json({ message: "จำนวนรายชื่อไม่ถูกต้อง" }, { status: 400 });
    }
    totalEntries = count;
    payload = { type: "FORM", count, notes, nameCustomer, phone };
  } else {
    const rawItems = Array.isArray(record.items) ? record.items : [];
    const items = rawItems
      .map((it) => {
        const r = (it ?? {}) as Record<string, unknown>;
        return {
          roundId: Number(r.roundId),
          zoneId: Number(r.zoneId),
          quantity: Number(r.quantity),
        };
      })
      .filter(
        (i) =>
          Number.isInteger(i.roundId) &&
          Number.isInteger(i.zoneId) &&
          Number.isInteger(i.quantity) &&
          i.quantity > 0
      );
    if (items.length === 0) {
      return NextResponse.json({ message: "กรุณาเลือกโซน/รอบ" }, { status: 400 });
    }
    totalEntries = items.reduce((s, i) => s + i.quantity, 0);
    if (totalEntries > MAX_ENTRIES) {
      return NextResponse.json({ message: "จำนวนบัตรเกินกำหนด" }, { status: 400 });
    }
    payload = { type: "TICKET", items, notes, nameCustomer, phone };
  }

  // Resolve the customer from the LINE session (login upserts this record;
  // upsert again as a safety net so charge creation never fails on a missing
  // customer).
  let customerId: number;
  try {
    const customer = await prisma.customer.upsert({
      where: { lineUserId: user.sub },
      create: { fullName: user.name, email: user.email ?? null, lineUserId: user.sub },
      update: {},
      select: { id: true },
    });
    customerId = customer.id;
  } catch (err) {
    console.error("omise charge: customer upsert failed:", err);
    return NextResponse.json({ message: "ไม่พบข้อมูลลูกค้า" }, { status: 500 });
  }

  const depositBaht = totalEntries * DEPOSIT_PER_ENTRY;
  const amountSatang = depositBaht * 100;

  try {
    const bookingCode = await generateUniqueBookingCode();
    const origin = getPublicOrigin(req);
    const charge = await createCharge({
      nonce,
      amount: amountSatang,
      returnUri: `${origin}/bookings?omise_return=1`,
      metadata: {
        bookingCode,
        eventId: String(eventId),
        customerId: String(customerId),
        depositBaht: String(depositBaht),
        payload: JSON.stringify(payload),
      },
    });
    return NextResponse.json({ data: { ...charge, bookingCode } });
  } catch (err) {
    console.error("omise charge error:", err);
    return NextResponse.json(
      {
        message:
          err instanceof Error ? err.message : "สร้างรายการชำระเงินไม่สำเร็จ",
      },
      { status: 502 }
    );
  }
}
