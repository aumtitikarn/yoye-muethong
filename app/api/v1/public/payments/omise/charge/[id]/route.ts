import { NextRequest, NextResponse } from "next/server";
import { retrieveCharge } from "@/lib/omise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/public/payments/omise/charge/:id
// Returns the current status of a charge. Used by the client to poll async
// methods (PromptPay QR, internet banking, TrueMoney) and after returning from
// an offsite redirect. Only non-sensitive status fields are exposed.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^chrg_/.test(id)) {
    return NextResponse.json({ message: "ไม่พบรายการชำระเงิน" }, { status: 400 });
  }
  try {
    const charge = await retrieveCharge(id);
    return NextResponse.json({
      data: {
        id: charge.id,
        status: charge.status,
        paid: charge.paid,
        failureMessage: charge.failureMessage,
      },
    });
  } catch (err) {
    console.error("omise retrieve error:", err);
    return NextResponse.json(
      { message: "ตรวจสอบสถานะไม่สำเร็จ" },
      { status: 502 }
    );
  }
}
