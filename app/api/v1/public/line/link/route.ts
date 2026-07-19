import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { clientIpFromRequest, consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min

// Generic message used for every ownership-verification failure so a caller
// can't probe which bookingCodes exist (enumeration protection).
const GENERIC_NOT_FOUND = "ไม่พบบุ๊คกิ้งหรือข้อมูลไม่ถูกต้อง";

// POST /api/v1/public/line/link
// Links the logged-in customer's LINE account to their booking so the admin can
// push LINE messages. The LINE userId is taken from the session (set at login),
// NOT from the request body, so a caller can't link someone else's account.
export async function POST(req: NextRequest) {
  // 1. Must be logged in via LINE.
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { message: "กรุณาเข้าสู่ระบบด้วย LINE ก่อน" },
      { status: 401 }
    );
  }

  // 2. Rate limit per IP.
  const ip = clientIpFromRequest(req);
  const rl = consumeRateLimit(`line-link:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "ส่งคำขอบ่อยเกินไป กรุณาลองใหม่ภายหลัง" },
      { status: 429 }
    );
  }

  // 3. Validate input.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const bookingCode =
    typeof (body as Record<string, unknown>)?.bookingCode === "string"
      ? ((body as Record<string, string>).bookingCode).trim()
      : "";
  const phoneLast4 =
    typeof (body as Record<string, unknown>)?.phoneLast4 === "string"
      ? ((body as Record<string, string>).phoneLast4).trim()
      : "";
  if (!bookingCode || !/^\d{4}$/.test(phoneLast4)) {
    return NextResponse.json({ message: "ข้อมูลไม่ครบถ้วน" }, { status: 400 });
  }

  // 4. Verify ownership: bookingCode + last 4 digits of the customer's phone.
  const booking = await prisma.booking.findUnique({
    where: { bookingCode },
    select: {
      deletedAt: true,
      customerId: true,
      customer: { select: { phone: true, lineUserId: true } },
    },
  });
  if (!booking || booking.deletedAt) {
    return NextResponse.json({ message: GENERIC_NOT_FOUND }, { status: 404 });
  }
  const phone = booking.customer.phone ?? "";
  if (!phone.endsWith(phoneLast4)) {
    return NextResponse.json({ message: GENERIC_NOT_FOUND }, { status: 404 });
  }

  // 5. Idempotent: already linked to the same LINE account.
  if (booking.customer.lineUserId === user.sub) {
    return NextResponse.json({ linked: true });
  }

  // 6. Store the LINE userId on the booking's customer. A stub customer may
  // already hold this lineUserId (created at login before the booking was
  // linked). Move it onto the booking's customer in one transaction so that
  // push targets the right record and we don't trip the unique constraint.
  try {
    await prisma.$transaction(async (tx) => {
      const holder = await tx.customer.findUnique({
        where: { lineUserId: user.sub },
        select: { id: true },
      });
      if (holder && holder.id !== booking.customerId) {
        await tx.customer.update({
          where: { id: holder.id },
          data: { lineUserId: null },
        });
      }
      await tx.customer.update({
        where: { id: booking.customerId },
        data: { lineUserId: user.sub },
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { message: "บัญชี LINE นี้ถูกผูกกับลูกค้าอื่นแล้ว" },
        { status: 400 }
      );
    }
    console.error("line/link error:", err);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาด กรุณาลองใหม่" },
      { status: 500 }
    );
  }

  return NextResponse.json({ linked: true });
}
