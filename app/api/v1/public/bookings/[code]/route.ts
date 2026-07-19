import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface DeepInfoFieldDTO {
  id: number;
  otherCode: string;
  label: string;
  isRequired: boolean;
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
  /** Event-level price (ยอดค่าบัตรรวม). */
  price: number;
  note?: string;
  zones: ZoneOptionDTO[];
  fields: DeepInfoFieldDTO[];
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
  notes: true,
  deletedAt: true,
  customer: { select: { lineUserId: true } },
  bookingItems: {
    select: {
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
      price: true,
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
  const quantity = b.bookingItems.reduce((s, i) => s + i.quantity, 0);

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
    quantity: Math.max(1, quantity),
    total: b.netCardPrice,
    serviceFee: b.serviceFee,
    price: b.event.price ? Number(b.event.price) : 0,
    note: b.notes ?? undefined,
    zones,
    fields: b.event.deepInfoFields,
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
