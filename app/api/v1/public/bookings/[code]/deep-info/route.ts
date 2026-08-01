import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_NOT_FOUND = "ไม่พบข้อมูลการจอง";

export interface DeepInfoResponseItem {
  fieldId: number;
  /** 1-based booked name/ticket this answer belongs to. Defaults to 1. */
  entryIndex?: number;
  value: string;
}

interface SaveDeepInfoBody {
  responses?: DeepInfoResponseItem[];
}

// POST /api/v1/public/bookings/:code/deep-info
// Save the caller's answers to the event's DeepInfoFields (deep_info_responses).
// Requires a LINE session and ownership of the booking. Upserts each field:
// creates/updates when a value is provided, deletes the row when cleared.
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

  let body: SaveDeepInfoBody;
  try {
    body = (await req.json()) as SaveDeepInfoBody;
  } catch {
    return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const responses = Array.isArray(body.responses) ? body.responses : null;
  if (!responses) {
    return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  // Normalise + validate shape up front.
  type NormalisedItem = { fieldId: number; entryIndex: number; value: string };
  const items: NormalisedItem[] = [];
  const seen = new Set<string>();
  for (const r of responses) {
    const fieldId = Number(r?.fieldId);
    if (!Number.isInteger(fieldId) || fieldId <= 0) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    // Absent entryIndex means the pre-per-entry payload shape → รายชื่อที่ 1.
    const entryIndex = r?.entryIndex === undefined ? 1 : Number(r.entryIndex);
    if (!Number.isInteger(entryIndex) || entryIndex <= 0) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    const key = `${fieldId}:${entryIndex}`;
    if (seen.has(key)) {
      return NextResponse.json(
        { message: "ส่งข้อมูลซ้ำสำหรับรายชื่อเดียวกัน" },
        { status: 400 }
      );
    }
    seen.add(key);
    const value = typeof r?.value === "string" ? r.value : "";
    if (value.length > 2000) {
      return NextResponse.json(
        { message: "ค่าต้องไม่เกิน 2000 ตัวอักษร" },
        { status: 400 }
      );
    }
    items.push({ fieldId, entryIndex, value });
  }

  try {
    // Resolve the booking and verify ownership before touching anything.
    const booking = await prisma.booking.findUnique({
      where: { bookingCode },
      select: {
        id: true,
        eventId: true,
        deletedAt: true,
        customer: { select: { lineUserId: true } },
        bookingItems: { select: { quantity: true } },
      },
    });
    if (
      !booking ||
      booking.deletedAt ||
      booking.customer.lineUserId !== user.sub
    ) {
      return NextResponse.json({ message: GENERIC_NOT_FOUND }, { status: 404 });
    }

    // A booking for 3 รายชื่อ has exactly 3 answer slots — reject anything past
    // that so a crafted payload can't stash rows the UI would never show.
    const entryCount = Math.max(
      1,
      booking.bookingItems.reduce((s, i) => s + i.quantity, 0),
    );
    if (items.some((i) => i.entryIndex > entryCount)) {
      return NextResponse.json(
        { message: `กรอกข้อมูลได้สูงสุด ${entryCount} รายชื่อตามจำนวนที่จอง` },
        { status: 400 }
      );
    }

    // Only allow fields that belong to this booking's event, and enforce
    // required fields.
    const fieldIds = items.map((i) => i.fieldId);
    const fields = await prisma.deepInfoField.findMany({
      where: { id: { in: fieldIds }, eventId: booking.eventId },
      select: { id: true, label: true, isRequired: true },
    });
    const fieldMap = new Map(fields.map((f) => [f.id, f]));

    for (const item of items) {
      const field = fieldMap.get(item.fieldId);
      if (!field) {
        return NextResponse.json(
          { message: "พบฟิลด์ที่ไม่อยู่ในงานนี้" },
          { status: 400 }
        );
      }
      if (field.isRequired && item.value.trim().length === 0) {
        return NextResponse.json(
          {
            message:
              entryCount > 1
                ? `กรุณากรอก "${field.label}" ของรายชื่อที่ ${item.entryIndex}`
                : `กรุณากรอก "${field.label}"`,
          },
          { status: 400 }
        );
      }
    }

    const bookingId = booking.id;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.deepInfoResponse.findMany({
        where: { bookingId, fieldId: { in: fieldIds } },
        select: { id: true, fieldId: true, entryIndex: true, value: true },
      });
      const existingMap = new Map(
        existing.map((e) => [`${e.fieldId}:${e.entryIndex}`, e]),
      );

      for (const item of items) {
        const prev = existingMap.get(`${item.fieldId}:${item.entryIndex}`);
        const trimmed = item.value.trim();

        if (trimmed.length === 0) {
          if (prev) await tx.deepInfoResponse.delete({ where: { id: prev.id } });
          continue;
        }
        if (!prev) {
          await tx.deepInfoResponse.create({
            data: {
              bookingId,
              fieldId: item.fieldId,
              entryIndex: item.entryIndex,
              value: trimmed,
            },
          });
        } else if (prev.value !== trimmed) {
          await tx.deepInfoResponse.update({
            where: { id: prev.id },
            data: { value: trimmed },
          });
        }
      }
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("public/bookings deep-info save error:", err);
    return NextResponse.json(
      { message: "บันทึกข้อมูลไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
