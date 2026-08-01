import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { canCancelEntries, toTrackingStatus } from "@/app/tracking/status-map";
import { expandEntrySlots } from "@/lib/booking-entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface DeepInfoFieldDTO {
  id: number;
  otherCode: string;
  label: string;
  isRequired: boolean;
}

/**
 * One booked name/ticket's worth of answers. A booking for 3 รายชื่อ gets three
 * of these (entryIndex 1..3), each carrying an answer for every field.
 */
export interface DeepInfoEntryDTO {
  /** 1-based — "รายชื่อที่ 1", "รายชื่อที่ 2", … */
  entryIndex: number;
  /** fieldId (as a string key, since JSON object keys are strings) -> answer. */
  values: Record<string, string>;
  /** Zone this slot belongs to (ticket events); null for form bookings. */
  zoneName: string | null;
}

export interface ZoneOptionDTO {
  id: number;
  name: string;
  price: number;
  available: boolean;
}

export interface BookingDetailDTO {
  bookingCode: string;
  eventName: string;
  poster: string;
  showTime: string;
  zone: string;
  eventTypes: "form" | "ticket";
  quantity: number;
  total: number;
  serviceFee: number;
  /** Event fee per entry (ค่ากด/รายชื่อ) — used for form totals. */
  feePerEntry: number;
  /** Deposit already paid (มัดจำ) — set on the Omise deposit charge. */
  depositPaid: number;
  /** Admin-set refund total (฿) once the booking is awaiting a refund. */
  refundAmount: number;
  /** Coarse customer-facing status (drives the payment/refund steps). */
  trackingStatus: string;
  note?: string;
  zones: ZoneOptionDTO[];
  /** Field definitions for this event (the same set repeats for every entry). */
  fields: DeepInfoFieldDTO[];
  /** Always exactly `quantity` items, blanks included, ordered by entryIndex. */
  entries: DeepInfoEntryDTO[];
  /**
   * True while the customer may still cancel individual entries — i.e. they are
   * within the ข้อมูลเชิงลึก step. The server enforces the same rule.
   */
  canCancelEntries: boolean;
  /** วิธีชำระค่าบัตรที่ลูกค้าเลือกไว้ — null = ยังไม่ได้เลือก / งานฟอร์ม */
  ticketPaymentMode: "STORE_PAID" | "SELF_PAID" | null;
}

const GENERIC_NOT_FOUND = "ไม่พบข้อมูลการจอง";

const FILES_URL_BASE = (
  process.env.NEXT_PUBLIC_FILES_URL_BASE ??
  process.env.FILES_PUBLIC_URL_BASE ??
  ""
).replace(/\/+$/, "");

const thaiDate = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

const bookingSelect = {
  bookingCode: true,
  netCardPrice: true,
  serviceFee: true,
  depositPaid: true,
  refundAmount: true,
  status: true,
  ticketPaymentMode: true,
  notes: true,
  deletedAt: true,
  customer: { select: { lineUserId: true } },
  deepInfoResponses: {
    select: { fieldId: true, entryIndex: true, value: true },
  },
  bookingItems: {
    // id order defines how entry 1..N map onto items — the same expansion the
    // cancel-entries endpoint uses, so both agree on which slot is which.
    orderBy: { id: "asc" },
    select: {
      id: true,
      quantity: true,
      round: { select: { date: true, time: true } },
      zone: { select: { name: true } },
    },
  },
  event: {
    select: {
      name: true,
      type: true,
      eventDate: true,
      feePerEntry: true,
      posterUrl: true,
      posterImage: true,
      showRounds: {
        orderBy: { date: "asc" },
        select: {
          zones: {
            orderBy: { id: "asc" },
            select: { id: true, name: true, price: true },
          },
        },
      },
      deepInfoFields: {
        orderBy: { id: "asc" },
        select: { id: true, otherCode: true, label: true, isRequired: true },
      },
    },
  },
} satisfies Prisma.BookingSelect;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

function resolvePoster(ev: BookingRow["event"]): string {
  const raw = ev.posterImage || ev.posterUrl;
  if (!raw) return "/con.jpeg";
  if (/^https?:\/\//.test(raw) || raw.startsWith("/")) return raw;
  return FILES_URL_BASE ? `${FILES_URL_BASE}/${raw}` : "/con.jpeg";
}

function shape(b: BookingRow): BookingDetailDTO {
  const isForm = b.event.type === "FORM";
  const round = b.bookingItems.find((i) => i.round)?.round;
  const showTime = round
    ? `${thaiDate.format(round.date)}${round.time ? ` (${round.time} น.)` : ""}`
    : b.event.eventDate
      ? thaiDate.format(b.event.eventDate)
      : "-";

  const zoneNames = Array.from(
    new Set(
      b.bookingItems
        .map((i) => i.zone?.name)
        .filter((n): n is string => Boolean(n)),
    ),
  );
  const zone = zoneNames.length > 0 ? zoneNames.join(", ") : isForm ? "รายชื่อ" : "-";

  // One answer set per booked name/ticket. Entries are always emitted for the
  // full booked quantity so the form renders every slot, filled or not.
  const answersByEntry = new Map<number, Record<string, string>>();
  for (const r of b.deepInfoResponses) {
    const bucket = answersByEntry.get(r.entryIndex) ?? {};
    bucket[String(r.fieldId)] = r.value;
    answersByEntry.set(r.entryIndex, bucket);
  }
  const slots = expandEntrySlots(b.bookingItems);
  const entries: DeepInfoEntryDTO[] = slots.map(({ entryIndex, item }) => ({
    entryIndex,
    values: answersByEntry.get(entryIndex) ?? {},
    zoneName: item.zone?.name ?? null,
  }));
  // Defensive: a booking with no items still shows one slot rather than none.
  if (entries.length === 0) {
    entries.push({ entryIndex: 1, values: answersByEntry.get(1) ?? {}, zoneName: null });
  }
  const quantity = entries.length;

  const zones: ZoneOptionDTO[] = isForm
    ? []
    : b.event.showRounds.flatMap((r) =>
        r.zones.map((z) => ({
          id: z.id,
          name: z.name,
          price: Number(z.price),
          available: true,
        })),
      );

  return {
    bookingCode: b.bookingCode,
    eventName: b.event.name,
    poster: resolvePoster(b.event),
    showTime,
    zone,
    eventTypes: isForm ? "form" : "ticket",
    quantity,
    total: b.netCardPrice,
    serviceFee: b.serviceFee,
    feePerEntry: b.event.feePerEntry ? Number(b.event.feePerEntry) : 0,
    depositPaid: b.depositPaid,
    refundAmount: b.refundAmount,
    trackingStatus: toTrackingStatus(b.status),
    note: b.notes ?? undefined,
    zones,
    fields: b.event.deepInfoFields,
    entries,
    canCancelEntries: canCancelEntries(b.status),
    ticketPaymentMode: b.ticketPaymentMode,
  };
}

// GET /api/v1/public/bookings/:code
// Full detail of the caller's own booking (requires LINE session + ownership).
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
      select: bookingSelect,
    });
    if (
      !booking ||
      booking.deletedAt ||
      booking.customer.lineUserId !== user.sub
    ) {
      return NextResponse.json({ message: GENERIC_NOT_FOUND }, { status: 404 });
    }
    return NextResponse.json({ data: shape(booking) });
  } catch (err) {
    console.error("public/bookings detail error:", err);
    return NextResponse.json(
      { message: "ไม่สามารถโหลดข้อมูลการจองได้" },
      { status: 500 }
    );
  }
}
