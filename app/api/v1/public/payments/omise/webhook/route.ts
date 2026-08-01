import { NextRequest, NextResponse } from "next/server";
import { retrieveCharge } from "@/lib/omise";
import {
  finalizeChargeToBooking,
  finalizeServiceFeeCharge,
  finalizeTicketFeeCharge,
} from "@/lib/booking-finalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/public/payments/omise/webhook
// Omise webhook receiver. Omise webhook POSTs are unauthenticated, so we NEVER
// trust the payload's status directly — we take only the object id from it and
// re-fetch the charge from the Omise API (authenticated with the secret key) to
// confirm the real state before acting.
//
// Register this URL in the Opn dashboard → Webhook Endpoints. It must be
// publicly reachable (behind a tunnel/HTTPS in dev).
export async function POST(req: NextRequest) {
  let event: unknown;
  try {
    event = await req.json();
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  const data = (event as { data?: { id?: string; object?: string } })?.data;
  const objectId = data?.id;

  // Only charge events carry an actionable charge id.
  if (!objectId || !/^chrg_/.test(objectId)) {
    // Ack other event types so Omise doesn't retry them.
    return NextResponse.json({ received: true });
  }

  try {
    const charge = await retrieveCharge(objectId);
    if (charge.paid && charge.status === "successful") {
      // Route by the `kind` metadata we set at charge creation: ค่ากด and ค่าบัตร
      // settle an existing booking; a charge with no `kind` is the deposit paid
      // at checkout → it creates the booking. Each finalizer also writes the
      // PaymentSlip row the admin's /payments page lists.
      const kind = charge.metadata.kind;
      const result =
        kind === "service_fee"
          ? await finalizeServiceFeeCharge(charge.id)
          : kind === "ticket_fee"
            ? await finalizeTicketFeeCharge(charge.id)
            : await finalizeChargeToBooking(charge.id);
      if (result.ok) {
        console.info(
          `omise webhook: charge ${charge.id} paid → ` +
            `${kind ?? "deposit"} ${result.bookingCode}` +
            (result.created ? " (applied)" : " (already settled)")
        );
      } else {
        console.warn(
          `omise webhook: charge ${charge.id} (kind=${kind ?? "deposit"}) not applied — ${result.reason}`
        );
      }
    } else if (charge.status === "failed" || charge.status === "expired") {
      console.info(`omise webhook: charge ${charge.id} ${charge.status}`);
    }
  } catch (err) {
    console.error("omise webhook verify error:", err);
    // Return 500 so Omise retries later rather than dropping the event.
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
