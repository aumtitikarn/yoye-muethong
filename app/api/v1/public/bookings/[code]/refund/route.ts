import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { toTrackingStatus } from "@/app/tracking/status-map";
import { TrackingStatus } from "@/app/tracking/types/enum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_NOT_FOUND = "ไม่พบข้อมูลการจอง";

interface RefundInfoBody {
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
}

// POST /api/v1/public/bookings/:code/refund
// Save the caller's bank details for a booking that is waiting for a refund.
// Requires a LINE session + ownership. Idempotent: updates the existing refund
// request if one is already on file, otherwise creates a new one. Amount is
// taken from the booking's admin-set refundAmount — never from the client.
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

  let body: RefundInfoBody;
  try {
    body = (await req.json()) as RefundInfoBody;
  } catch {
    return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const bankName = (body.bankName ?? "").trim();
  const accountHolder = (body.accountHolder ?? "").trim();
  // Keep only digits for the account number.
  const accountNumber = (body.accountNumber ?? "").replace(/\D/g, "");

  if (!bankName || !accountHolder || accountNumber.length < 6) {
    return NextResponse.json(
      {
        message:
          "กรุณากรอกธนาคาร ชื่อเจ้าของบัญชี และเลขบัญชี/PromptPay/บัตรประชาชนให้ถูกต้อง",
      },
      { status: 400 }
    );
  }
  if (bankName.length > 100 || accountHolder.length > 100 || accountNumber.length > 30) {
    return NextResponse.json({ message: "ข้อมูลยาวเกินกำหนด" }, { status: 400 });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { bookingCode },
      select: {
        id: true,
        status: true,
        refundAmount: true,
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

    // Only a booking that is actually awaiting a refund may accept bank info.
    if (toTrackingStatus(booking.status) !== TrackingStatus.WAIT_REFUND) {
      return NextResponse.json(
        { message: "รายการนี้ยังไม่อยู่ในสถานะรอคืนเงิน" },
        { status: 409 }
      );
    }

    const existing = await prisma.refundRequest.findFirst({
      where: { bookingId: booking.id },
      orderBy: { requestedAt: "desc" },
      select: { id: true },
    });

    if (existing) {
      await prisma.refundRequest.update({
        where: { id: existing.id },
        data: { bankName, accountNumber, accountHolder, amount: booking.refundAmount },
      });
    } else {
      await prisma.refundRequest.create({
        data: {
          bookingId: booking.id,
          bankName,
          accountNumber,
          accountHolder,
          amount: booking.refundAmount,
        },
      });
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("public/bookings refund save error:", err);
    return NextResponse.json(
      { message: "บันทึกข้อมูลคืนเงินไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
