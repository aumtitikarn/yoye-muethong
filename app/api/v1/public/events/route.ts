import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EEventTypes, EZoneStatus } from "@/app/bookings/types/enum";
import type { BookingEvent } from "@/mockData/event.data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public listing of bookable events for step 1 of the storefront booking flow.
// Reads the shared yoye-admin database directly (same pattern as the line/link
// route). Admin owns writes; the storefront only reads.

const FILES_URL_BASE = (
  process.env.NEXT_PUBLIC_FILES_URL_BASE ??
  process.env.FILES_PUBLIC_URL_BASE ??
  ""
).replace(/\/+$/, "");

const eventSelect = {
  id: true,
  name: true,
  notes: true,
  posterUrl: true,
  posterImage: true,
  type: true,
  eventDate: true,
  feePerEntry: true,
  queueAcceptanceStatus: true,
  showRounds: {
    orderBy: { date: "asc" },
    select: {
      id: true,
      name: true,
      date: true,
      time: true,
      zones: {
        orderBy: { id: "asc" },
        select: { id: true, name: true, price: true, fee: true, capacity: true },
      },
    },
  },
} satisfies Prisma.EventSelect;

type EventRow = Prisma.EventGetPayload<{ select: typeof eventSelect }>;

const thaiDate = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

function resolvePoster(row: EventRow): string {
  const raw = row.posterImage || row.posterUrl;
  if (!raw) return "/con.jpeg";
  if (/^https?:\/\//.test(raw) || raw.startsWith("/")) return raw;
  return FILES_URL_BASE ? `${FILES_URL_BASE}/${raw}` : "/con.jpeg";
}

function showTimeLabel(row: EventRow): string {
  if (row.eventDate) return thaiDate.format(row.eventDate);
  const dates = row.showRounds.map((r) => r.date);
  if (dates.length === 0) return "-";
  const first = thaiDate.format(dates[0]);
  const last = thaiDate.format(dates[dates.length - 1]);
  return first === last ? first : `${first} - ${last}`;
}

function ticketInfo(row: EventRow, servicePriceForm: number): string {
  if (row.type === "FORM") {
    return servicePriceForm ? `ค่ากด ${servicePriceForm.toLocaleString()} / รายชื่อ` : "";
  }
  const zones = row.showRounds.flatMap((r) => r.zones);
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const z of zones) {
    if (seen.has(z.name)) continue;
    seen.add(z.name);
    parts.push(`${z.name} ${Number(z.price).toLocaleString()}`);
  }
  return parts.join(" / ");
}

function shapeEvent(row: EventRow): BookingEvent {
  const servicePriceForm = row.feePerEntry ? Number(row.feePerEntry) : 0;
  // The queue is "open" for normal storefront booking only when OPEN. Any other
  // state (NOT_OPEN / REWARD_ONLY / CLOSED) shows as full on the storefront.
  const statusEvent =
    row.queueAcceptanceStatus === "OPEN"
      ? EZoneStatus.AVAILABLE
      : EZoneStatus.SOLD_OUT;

  return {
    id: row.id,
    name: row.name,
    poster: resolvePoster(row),
    showTime: showTimeLabel(row),
    statusEvent,
    ticketInfo: ticketInfo(row, servicePriceForm),
    servicePriceForm,
    eventTypes: row.type === "FORM" ? EEventTypes.form : EEventTypes.ticket,
    note: row.notes ?? undefined,
    showTimeOptions:
      row.type === "TICKET"
        ? row.showRounds.map((round) => ({
            id: round.id,
            name: round.name,
            time: round.date.getTime(),
            zones: round.zones.map((z) => ({
              id: z.id,
              name: z.name,
              // NOTE: live per-zone availability is gated by presser-quota logic
              // in yoye-admin and isn't computed here — we surface capacity so
              // the zone list renders. Availability at booking time is enforced
              // server-side in later steps.
              remaining: z.capacity,
              ticketPrice: Number(z.price),
              servicePrice: Number(z.fee),
              status: EZoneStatus.AVAILABLE,
            })),
          }))
        : undefined,
  };
}

export async function GET() {
  try {
    const events = await prisma.event.findMany({
      where: { deletedAt: null, isActive: true, status: true },
      orderBy: { createdAt: "desc" },
      select: eventSelect,
    });
    return NextResponse.json({ data: events.map(shapeEvent) });
  } catch (err) {
    console.error("public/events error:", err);
    return NextResponse.json(
      { message: "ไม่สามารถโหลดรายการงานได้" },
      { status: 500 }
    );
  }
}
