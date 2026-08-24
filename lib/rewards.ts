import { BookingStatus } from "@prisma/client";

/**
 * แต้มที่ต้องใช้ต่อสิทธิลัดคิว 1 งาน — ต้องตรงกับ REDEMPTION_COST ใน yoye-admin
 * (lib/api/rewards-service.ts) เพราะฝั่งนั้นเป็นคนตัดแต้มจริง หน้านี้แค่แสดงผล
 */
export const REDEMPTION_COST = 5;

/**
 * สถานะที่แปลว่า "ลูกค้าได้บัตรแล้ว" — เงื่อนไขเดียวกับ TICKET_EARNED_STATUSES
 * ใน yoye-admin (app/api/v1/rewards/_service.ts) ถ้าสองฝั่งไม่ตรงกัน ลูกค้าจะส่ง
 * คำขอผ่านหน้านี้ได้แต่แอดมินกดอนุมัติไม่ได้ (หรือกลับกัน)
 */
export const TICKET_EARNED_STATUSES: BookingStatus[] = [
  BookingStatus.FULLY_BOOKED,
  BookingStatus.PARTIALLY_BOOKED,
  BookingStatus.TEAM_BOOKED,
  BookingStatus.PARTIAL_SELF_TEAM_BOOKING,
  BookingStatus.COMPLETED,
];

/** จำนวนสิทธิลัดคิวที่แลกได้จากแต้มที่มีอยู่ตอนนี้ */
export function availableRedemptions(points: number): number {
  return Math.floor(Math.max(points, 0) / REDEMPTION_COST);
}

/** ขาดอีกกี่แต้มถึงจะได้สิทธิถัดไป (0 = ครบพอดี แลกได้เลย) */
export function pointsToNextRedemption(points: number): number {
  const remainder = Math.max(points, 0) % REDEMPTION_COST;
  return remainder === 0 ? 0 : REDEMPTION_COST - remainder;
}

export const LEDGER_REASON_LABELS: Record<string, string> = {
  REVIEW_APPROVED: "ได้แต้มจากรีวิว",
  REDEMPTION: "ใช้แต้มลัดคิว",
  REDEMPTION_CANCELLED: "คืนแต้มจากการยกเลิกสิทธิ์",
  BOOKING_CANCELLED_REFUND: "คืนแต้มจากการยกเลิกงาน",
  ADMIN_ADJUSTMENT: "แอดมินปรับแต้ม",
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "รอแอดมินตรวจ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่ผ่าน",
};
