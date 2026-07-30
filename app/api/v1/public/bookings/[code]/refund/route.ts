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
  amount?: number;
}

export interface RefundAccountDTO {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
  status: string;
  requestedAt: string;
}

export interface RefundTransactionDTO {
  id: number;
  amount: number;
  paidAt: string;
  payoutSlipUrl: string | null;
  status: string;
}

export interface RefundSummaryDTO {
  /** Admin-set refund total (฿). */
  refundAmount: number;
  /** Coarse customer-facing status. */
  trackingStatus: string;
  /** True while the customer may still submit / edit bank info. */
  editable: boolean;
  /** Latest bank info the customer submitted, if any. */
  account: RefundAccountDTO | null;
  /** Payouts the shop has already made to the customer (paidAt set). */
  transactions: RefundTransactionDTO[];
}

// GET /api/v1/public/bookings/:code/refund
// Refund summary for the caller's own booking: admin-set amount, the latest
// bank info submitted, and any payouts the shop has already made. Requires a
// LINE session + ownership. All money fields are read from the DB — the client
// never supplies them.
export async function GET(
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
        status: true,
        refundAmount: true,
        deletedAt: true,
        customer: { select: { lineUserId: true } },
        refundRequests: {
          orderBy: { requestedAt: "desc" },
          select: {
            id: true,
            bankName: true,
            accountNumber: true,
            accountHolder: true,
            amount: true,
            status: true,
            payoutSlipUrl: true,
            paidAt: true,
            requestedAt: true,
          },
        },
      },
    });
    if (
      !booking ||
      booking.deletedAt ||
      booking.customer.lineUserId !== user.sub
    ) {
      return NextResponse.json({ message: GENERIC_NOT_FOUND }, { status: 404 });
    }

    const trackingStatus = toTrackingStatus(booking.status);
    const latest = booking.refundRequests[0] ?? null;
    // The customer may still edit while awaiting a refund and nothing has been
    // paid out yet.
    const editable =
      trackingStatus === TrackingStatus.WAIT_REFUND &&
      (!latest || latest.status !== "PAID");

    const account: RefundAccountDTO | null = latest
      ? {
          bankName: latest.bankName,
          accountNumber: latest.accountNumber,
          accountHolder: latest.accountHolder,
          amount: latest.amount,
          status: latest.status,
          requestedAt: latest.requestedAt.toISOString(),
        }
      : null;

    const transactions: RefundTransactionDTO[] = booking.refundRequests
      .filter((r) => r.paidAt)
      .map((r) => ({
        id: r.id,
        amount: r.amount,
        paidAt: (r.paidAt as Date).toISOString(),
        payoutSlipUrl: r.payoutSlipUrl,
        status: r.status,
      }));

    const data: RefundSummaryDTO = {
      refundAmount: booking.refundAmount,
      trackingStatus,
      editable,
      account,
      transactions,
    };
    return NextResponse.json({ data });
  } catch (err) {
    console.error("public/bookings refund summary error:", err);
    return NextResponse.json(
      { message: "ไม่สามารถโหลดข้อมูลคืนเงินได้" },
      { status: 500 }
    );
  }
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
  const amount = Number(body.amount);

  if (!bankName || !accountHolder || accountNumber.length < 6) {
    return NextResponse.json(
      {
        message:
          "กรุณากรอกธนาคาร ชื่อเจ้าของบัญชี และเลขบัญชี/PromptPay/บัตรประชาชนให้ถูกต้อง",
      },
      { status: 400 }
    );
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { message: "กรุณากรอกยอดเงินคืนให้ถูกต้อง" },
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
        data: { bankName, accountNumber, accountHolder, amount },
      });
    } else {
      await prisma.refundRequest.create({
        data: {
          bookingId: booking.id,
          bankName,
          accountNumber,
          accountHolder,
          amount,
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
