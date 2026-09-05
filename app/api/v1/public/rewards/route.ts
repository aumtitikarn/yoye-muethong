import { NextRequest, NextResponse } from "next/server";
import { EventType, RewardRedemptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import {
  REDEMPTION_COST,
  TICKET_EARNED_STATUSES,
  availableRedemptions,
  pointsToNextRedemption,
} from "@/lib/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REVIEW_LINK = 500;
const MAX_NOTES = 500;
const MAX_PROOF_BYTES = 8 * 1024 * 1024; // 8MB (ก่อน encode เป็น base64)

/**
 * ส่งรูปหลักฐานไปให้ yoye-admin เก็บ แล้วเอา URL กลับมาใส่ proofLink
 *
 * repo นี้ไม่มี uploader (ไม่มี dep ssh2-sftp-client) ส่วน yoye-admin เป็นเจ้าของ
 * storage อยู่แล้ว จึงยิงข้ามไปที่นั่นแทนการลง dep ซ้ำสองที่
 *
 * โยน error เมื่ออัปโหลดไม่สำเร็จ — ไม่ยอมบันทึกคำขอแบบเงียบ ๆ โดยไม่มีรูป
 * เพราะลูกค้าเลือกแนบมาแล้วและจะเข้าใจว่าแอดมินได้รับรูปด้วย
 */
async function uploadProof(imageDataUrl: string): Promise<string> {
  const base = process.env.ADMIN_API_URL?.replace(/\/+$/, "");
  const key = process.env.INTERNAL_API_KEY;
  if (!base || !key) {
    throw new Error("ระบบยังไม่พร้อมรับรูป กรุณาส่งเฉพาะลิงก์รีวิว");
  }
  const res = await fetch(`${base}/api/v1/public/reward-proofs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": key },
    body: JSON.stringify({ imageDataUrl }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(json?.message ?? "อัปโหลดรูปไม่สำเร็จ");
  }
  const json = (await res.json()) as { data?: { url?: string } };
  const url = json.data?.url;
  if (!url) throw new Error("อัปโหลดรูปไม่สำเร็จ");
  return url;
}

export interface RewardSummaryDTO {
  currentPoints: number;
  redemptionCost: number;
  /** สิทธิลัดคิวที่แลกได้ตอนนี้ — ตัวเลขที่ลูกค้าถามหาบ่อยสุด */
  availableRedemptions: number;
  /** ขาดอีกกี่แต้มถึงสิทธิถัดไป (0 = ครบพอดี) */
  pointsToNext: number;
  /** สิทธิที่ใช้ไปแล้วและยังไม่ถูกยกเลิก */
  activeRedemptions: { id: number; eventName: string; usedAt: string }[];
  requests: {
    id: number;
    eventName: string;
    status: string;
    reviewLink: string;
    rejectionReason: string | null;
    createdAt: string;
  }[];
  ledger: {
    id: number;
    amount: number;
    reason: string;
    note: string | null;
    eventName: string | null;
    createdAt: string;
  }[];
  /** งานที่ยังส่งรีวิวรับแต้มได้ — 1 งาน ส่งได้ครั้งเดียว */
  eligibleBookings: { bookingCode: string; eventName: string }[];
}

/** null = ยังไม่ได้ login หรือยังไม่มี customer ผูกกับ LINE นี้ */
async function resolveCustomer(req: NextRequest) {
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return { unauthorized: true as const };
  const customer = await prisma.customer.findUnique({
    where: { lineUserId: user.sub },
    select: { id: true, currentPoints: true },
  });
  return { unauthorized: false as const, customer };
}

// GET /api/v1/public/rewards — บัตรสะสมแต้มของลูกค้าที่ login อยู่
export async function GET(req: NextRequest) {
  const resolved = await resolveCustomer(req);
  if (resolved.unauthorized) {
    return NextResponse.json(
      { message: "กรุณาเข้าสู่ระบบด้วย LINE ก่อน" },
      { status: 401 },
    );
  }

  // ยังไม่เคยจองกับร้าน — ไม่ใช่ error แค่ยังไม่มีแต้ม
  if (!resolved.customer) {
    return NextResponse.json({ data: emptySummary() });
  }
  const { id: customerId, currentPoints } = resolved.customer;

  try {
    const [redemptions, requests, ledger, bookings] = await Promise.all([
      prisma.rewardRedemption.findMany({
        where: { customerId, status: RewardRedemptionStatus.ACTIVE },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, event: { select: { name: true } } },
      }),
      prisma.rewardRequest.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          reviewLink: true,
          rejectionReason: true,
          createdAt: true,
          event: { select: { name: true } },
        },
      }),
      prisma.rewardLedger.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          amount: true,
          reason: true,
          note: true,
          createdAt: true,
          redemption: { select: { event: { select: { name: true } } } },
        },
      }),
      // งานที่ได้บัตรแล้วและยังไม่เคยส่งคำขอ — rewardRequest.bookingId เป็น unique
      // ดังนั้น 1 งาน = สูงสุด 1 แต้ม ถูกบังคับที่ DB ไม่ใช่แค่ที่ UI
      prisma.booking.findMany({
        where: {
          customerId,
          deletedAt: null,
          status: { in: TICKET_EARNED_STATUSES },
          event: { type: EventType.TICKET, deletedAt: null },
          rewardRequest: null,
        },
        orderBy: { createdAt: "desc" },
        select: { bookingCode: true, event: { select: { name: true } } },
      }),
    ]);

    const data: RewardSummaryDTO = {
      currentPoints,
      redemptionCost: REDEMPTION_COST,
      availableRedemptions: availableRedemptions(currentPoints),
      pointsToNext: pointsToNextRedemption(currentPoints),
      activeRedemptions: redemptions.map((r) => ({
        id: r.id,
        eventName: r.event.name,
        usedAt: r.createdAt.toISOString(),
      })),
      requests: requests.map((r) => ({
        id: r.id,
        eventName: r.event.name,
        status: r.status,
        reviewLink: r.reviewLink,
        rejectionReason: r.rejectionReason,
        createdAt: r.createdAt.toISOString(),
      })),
      ledger: ledger.map((l) => ({
        id: l.id,
        amount: l.amount,
        reason: l.reason,
        note: l.note,
        eventName: l.redemption?.event.name ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
      eligibleBookings: bookings.map((b) => ({
        bookingCode: b.bookingCode,
        eventName: b.event.name,
      })),
    };
    return NextResponse.json({ data });
  } catch (err) {
    console.error("public/rewards GET error:", err);
    return NextResponse.json(
      { message: "ไม่สามารถโหลดข้อมูลแต้มได้" },
      { status: 500 },
    );
  }
}

function emptySummary(): RewardSummaryDTO {
  return {
    currentPoints: 0,
    redemptionCost: REDEMPTION_COST,
    availableRedemptions: 0,
    pointsToNext: REDEMPTION_COST,
    activeRedemptions: [],
    requests: [],
    ledger: [],
    eligibleBookings: [],
  };
}

// POST /api/v1/public/rewards — ลูกค้าส่งลิงก์รีวิวเพื่อขอแต้ม
export async function POST(req: NextRequest) {
  const resolved = await resolveCustomer(req);
  if (resolved.unauthorized || !resolved.customer) {
    return NextResponse.json(
      { message: "กรุณาเข้าสู่ระบบด้วย LINE ก่อน" },
      { status: 401 },
    );
  }
  const customerId = resolved.customer.id;

  let body: {
    bookingCode?: unknown;
    reviewLink?: unknown;
    notes?: unknown;
    proofImageDataUrl?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const bookingCode = typeof body.bookingCode === "string" ? body.bookingCode.trim() : "";
  const reviewLink = typeof body.reviewLink === "string" ? body.reviewLink.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const proofImageDataUrl =
    typeof body.proofImageDataUrl === "string" ? body.proofImageDataUrl : "";

  if (!bookingCode) {
    return NextResponse.json({ message: "กรุณาเลือกงานที่ต้องการรับแต้ม" }, { status: 400 });
  }
  if (!reviewLink || reviewLink.length > MAX_REVIEW_LINK) {
    return NextResponse.json({ message: "กรุณาใส่ลิงก์รีวิวให้ถูกต้อง" }, { status: 400 });
  }
  if (notes.length > MAX_NOTES) {
    return NextResponse.json({ message: "หมายเหตุยาวเกินไป" }, { status: 400 });
  }
  // base64 ยาวกว่าไฟล์จริงราว 4/3 — เช็คคร่าว ๆ ที่นี่ก่อนยิงข้าม service
  if (proofImageDataUrl && proofImageDataUrl.length > MAX_PROOF_BYTES * 1.4) {
    return NextResponse.json({ message: "ไฟล์รูปใหญ่เกิน 8MB" }, { status: 400 });
  }
  // กันการแปะข้อความมั่ว ๆ ที่ไม่ใช่ลิงก์ — แอดมินต้องกดเปิดดูได้จริง
  if (!/^https?:\/\/\S+$/i.test(reviewLink)) {
    return NextResponse.json(
      { message: "ลิงก์รีวิวต้องขึ้นต้นด้วย http:// หรือ https://" },
      { status: 400 },
    );
  }

  try {
    // where ผูก customerId ไว้ด้วย — ลูกค้าส่งรีวิวแทน booking ของคนอื่นไม่ได้
    // แม้จะเดารหัสจองถูก
    const booking = await prisma.booking.findFirst({
      where: { bookingCode, customerId, deletedAt: null },
      select: {
        id: true,
        eventId: true,
        status: true,
        event: { select: { type: true, deletedAt: true } },
        rewardRequest: { select: { id: true } },
      },
    });
    if (!booking) {
      return NextResponse.json({ message: "ไม่พบงานนี้ในรายการของคุณ" }, { status: 404 });
    }
    if (booking.event.deletedAt) {
      return NextResponse.json({ message: "งานนี้ถูกลบแล้ว" }, { status: 400 });
    }
    if (booking.event.type !== EventType.TICKET) {
      return NextResponse.json(
        { message: "งานประเภทกรอกฟอร์มไม่สามารถสะสมแต้มได้" },
        { status: 400 },
      );
    }
    if (!TICKET_EARNED_STATUSES.includes(booking.status)) {
      return NextResponse.json(
        { message: "งานนี้ยังไม่อยู่ในขั้นตอนที่รับแต้มได้" },
        { status: 400 },
      );
    }
    if (booking.rewardRequest) {
      return NextResponse.json({ message: "งานนี้ส่งคำขอแต้มไปแล้ว" }, { status: 409 });
    }

    // อัปโหลดก่อนเขียน DB — ถ้ารูปพัง จะได้ไม่มีแถวคำขอค้างแบบไม่มีหลักฐาน
    let proofLink: string | null = null;
    if (proofImageDataUrl) {
      try {
        proofLink = await uploadProof(proofImageDataUrl);
      } catch (err) {
        return NextResponse.json(
          { message: err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ" },
          { status: 502 },
        );
      }
    }

    const request = await prisma.rewardRequest.create({
      data: {
        customerId,
        bookingId: booking.id,
        eventId: booking.eventId,
        reviewLink,
        proofLink,
        notes: notes || null,
        source: "PUBLIC",
      },
      select: { id: true, status: true, createdAt: true },
    });
    return NextResponse.json({ data: request }, { status: 201 });
  } catch (err) {
    console.error("public/rewards POST error:", err);
    return NextResponse.json(
      { message: "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่" },
      { status: 500 },
    );
  }
}
