import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_NOT_FOUND = "ไม่พบข้อมูลการจอง";

export interface DeepInfoResponseItem {
  fieldId: number;
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
  const items: DeepInfoResponseItem[] = [];
  for (const r of responses) {
    const fieldId = Number(r?.fieldId);
    if (!Number.isInteger(fieldId) || fieldId <= 0) {
      return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    const value = typeof r?.value === "string" ? r.value : "";
    if (value.length > 2000) {
      return NextResponse.json(
        { message: "ค่าต้องไม่เกิน 2000 ตัวอักษร" },
        { status: 400 }
      );
    }
    items.push({ fieldId, value });
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
      },
    });
    if (
      !booking ||
      booking.deletedAt ||
      booking.customer.lineUserId !== user.sub
    ) {
      return NextResponse.json({ message: GENERIC_NOT_FOUND }, { status: 404 });
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
          { message: `กรุณากรอก "${field.label}"` },
          { status: 400 }
        );
      }
    }

    const bookingId = booking.id;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.deepInfoResponse.findMany({
        where: { bookingId, fieldId: { in: fieldIds } },
        select: { id: true, fieldId: true, value: true },
      });
      const existingMap = new Map(existing.map((e) => [e.fieldId, e]));

      for (const item of items) {
        const prev = existingMap.get(item.fieldId);
        const trimmed = item.value.trim();

        if (trimmed.length === 0) {
          if (prev) await tx.deepInfoResponse.delete({ where: { id: prev.id } });
          continue;
        }
        if (!prev) {
          await tx.deepInfoResponse.create({
            data: { bookingId, fieldId: item.fieldId, value: trimmed },
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
