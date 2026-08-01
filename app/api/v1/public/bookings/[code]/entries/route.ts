import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { getSystemActorId } from "@/lib/system-actor";
import { expandEntrySlots } from "@/lib/booking-entries";
import { canCancelEntries } from "@/app/tracking/status-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_NOT_FOUND = "ไม่พบข้อมูลการจอง";
const TOO_LATE =
  "เลยขั้นตอนกรอกข้อมูลการจองแล้ว ไม่สามารถลดจำนวนเองได้ กรุณาติดต่อแอดมิน";

interface CancelEntriesBody {
  /** 1-based entry numbers the customer wants to drop. */
  removeEntryIndexes?: number[];
}

/**
 * DELETE /api/v1/public/bookings/:code/entries
 *
 * Cancel specific booked names/tickets ("ลดจำนวน"). The customer picks exactly
 * which slots to drop — for form bookings they are identified by the name the
 * customer filled in, so the right one goes.
 *
 * The deposit for the dropped slots is NOT refunded (shop terms), so no money
 * field is touched here: `depositPaid` stays as-is and the admin's billing math
 * keeps working off it.
 *
 * Only allowed while the customer is still filling in ข้อมูลเชิงลึก (see
 * canCancelEntries) — not merely "before pressing". Past that point the ค่าบัตร
 * for N tickets has already been transferred, so dropping one would desync
 * money that has already changed hands.
 */
export async function DELETE(
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

  let body: CancelEntriesBody;
  try {
    body = (await req.json()) as CancelEntriesBody;
  } catch {
    return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const raw = Array.isArray(body.removeEntryIndexes)
    ? body.removeEntryIndexes
    : null;
  if (!raw || raw.length === 0) {
    return NextResponse.json(
      { message: "กรุณาเลือกรายการที่ต้องการยกเลิก" },
      { status: 400 }
    );
  }
  const removeSet = new Set<number>();
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    removeSet.add(n);
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { bookingCode },
      select: {
        id: true,
        status: true,
        deletedAt: true,
        customer: { select: { lineUserId: true } },
        event: { select: { type: true } },
        bookingItems: {
          orderBy: { id: "asc" },
          select: { id: true, quantity: true },
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

    if (!canCancelEntries(booking.status)) {
      return NextResponse.json({ message: TOO_LATE }, { status: 409 });
    }

    const slots = expandEntrySlots(booking.bookingItems);
    const total = slots.length;

    for (const idx of removeSet) {
      if (idx > total) {
        return NextResponse.json(
          { message: "ข้อมูลไม่ถูกต้อง" },
          { status: 400 }
        );
      }
    }
    // Dropping everything is a full cancellation, which is a different action
    // with its own confirmation — keep them separate.
    if (removeSet.size >= total) {
      return NextResponse.json(
        {
          message:
            "ไม่สามารถยกเลิกทั้งหมดจากหน้านี้ได้ กรุณาใช้ปุ่มยกเลิกการจองในหน้าติดตามสถานะ",
        },
        { status: 400 }
      );
    }

    const unitWord = booking.event.type === "FORM" ? "รายชื่อ" : "ใบ";
    const kept = slots.filter((s) => !removeSet.has(s.entryIndex));

    // How many units each item keeps, after the removals.
    const keptPerItem = new Map<number, number>();
    for (const item of booking.bookingItems) keptPerItem.set(item.id, 0);
    for (const slot of kept) {
      keptPerItem.set(slot.item.id, (keptPerItem.get(slot.item.id) ?? 0) + 1);
    }

    const systemActorId = await getSystemActorId();
    const bookingId = booking.id;

    await prisma.$transaction(async (tx) => {
      for (const [itemId, qty] of keptPerItem) {
        if (qty === 0) {
          await tx.bookingItem.delete({ where: { id: itemId } });
        } else {
          await tx.bookingItem.update({
            where: { id: itemId },
            data: { quantity: qty },
          });
        }
      }

      // Drop the cancelled slots' answers…
      await tx.deepInfoResponse.deleteMany({
        where: { bookingId, entryIndex: { in: [...removeSet] } },
      });

      // …then close the gaps so the remaining entries stay 1..N. Renumbering in
      // ascending order only ever moves an entry to a *lower*, already-vacated
      // index, so the (bookingId, fieldId, entryIndex) unique never collides.
      for (let i = 0; i < kept.length; i++) {
        const oldIndex = kept[i].entryIndex;
        const newIndex = i + 1;
        if (newIndex === oldIndex) continue;
        await tx.deepInfoResponse.updateMany({
          where: { bookingId, entryIndex: oldIndex },
          data: { entryIndex: newIndex },
        });
      }

      await tx.bookingStatusLog.create({
        data: {
          bookingId,
          changedBy: systemActorId,
          status: booking.status,
          notes: `ลูกค้ายกเลิก ${removeSet.size} ${unitWord} เอง (เหลือ ${kept.length} ${unitWord}) — ไม่คืนมัดจำส่วนที่ลดลง`,
        },
      });
    });

    return NextResponse.json({
      data: { ok: true, remaining: kept.length, removed: removeSet.size },
    });
  } catch (err) {
    console.error("public/bookings cancel entries error:", err);
    return NextResponse.json(
      { message: "ยกเลิกรายการไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
