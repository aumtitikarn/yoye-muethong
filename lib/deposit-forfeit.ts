/**
 * มัดจำถูกยึดอัตโนมัติเมื่อลูกค้ายกเลิกเอง
 *
 * เงื่อนไขร้านคือมัดจำคืนเฉพาะกรณีร้านกดให้ไม่ได้จริง — ลูกค้ายกเลิกเองยึดเสมอ
 * ทั้งยกเลิกทั้งคิว และยกเลิกเป็นจำนวนใบ/รายชื่อ. ก่อนหน้านี้หน้าร้านแค่เปลี่ยน
 * สถานะ booking แล้วปล่อยให้แอดมินมาตัดสินมัดจำเองทีหลัง ซึ่งแปลว่ารายการยกเลิก
 * ไม่เคยโผล่ในหน้า "มัดจำ" ของ yoye-admin เลย. ที่นี่จึงเขียน ledger ให้ครบตั้งแต่
 * ตอนลูกค้ากดยกเลิก — mirror ของ yoye-admin/lib/api/deposit-service.ts
 *
 * โครงของ ledger (ดู prisma/schema.prisma):
 * - แถว `FORFEITED` = ยึดบางส่วน (ยกเลิกทีละใบ) — booking ยังเดินต่อ, recomputeDeposit
 *   ฝั่งแอดมินจะไม่แตะแถวนี้ และคิดยอดที่เหลือจาก depositPaid ลบยอดที่ยึดไปแล้ว
 * - แถว `HELD` = แถวปิดจบของ booking (ยึด/ใช้/คืน ก้อนที่เหลือ) — ยกเลิกทั้งคิวเขียนแถวนี้
 *
 * `amount` ของทุกแถวที่ตัดสินแล้วรวมกันได้เท่ากับ booking.depositPaid เสมอ
 * ซึ่งเป็นสิ่งที่ทำให้ยอดรวมในหน้าการเงินของแอดมินไม่เพี้ยน
 */

import {
  DepositReason,
  DepositStatus,
  DepositTransactionType,
  Prisma,
} from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const round2 = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/** ยอดมัดจำที่ถูกยึดไปแล้วจากการยกเลิกทีละใบ (แถว type = FORFEITED). */
export async function sumForfeitedEntries(
  tx: Tx,
  bookingId: number,
): Promise<number> {
  const agg = await tx.depositTransaction.aggregate({
    _sum: { forfeitedAmount: true },
    where: { bookingId, type: DepositTransactionType.FORFEITED },
  });
  return round2(Number(agg._sum.forfeitedAmount ?? 0));
}

/**
 * ยึดมัดจำเฉพาะส่วนของใบ/รายชื่อที่ลูกค้ายกเลิก (ยกเลิกเป็นจำนวน)
 *
 * คิดตามสัดส่วน "มัดจำที่ยังไม่ถูกยึด / จำนวนใบที่ยังเหลืออยู่ตอนนี้" — ไม่ hardcode
 * 100 บาท/ใบ เพราะ booking ที่แอดมินสร้างเองอาจวางมัดจำเรตอื่น และการหารจากยอดที่
 * เหลือทำให้ยกเลิกหลายรอบยังได้ราคาต่อใบเท่าเดิม (300฿/3 ใบ → ยกเลิกทีละใบสองรอบ
 * = ยึด 100 + 100 ไม่ใช่ 100 + 150)
 *
 * คืนยอดที่ยึดจริง (0 = ไม่มีมัดจำให้ยึด → ไม่เขียน ledger)
 */
export async function forfeitCancelledEntries(
  tx: Tx,
  args: {
    bookingId: number;
    eventId: number;
    /** มัดจำที่ลูกค้าวางไว้ทั้งก้อน (booking.depositPaid) */
    depositPaid: number;
    /** จำนวนใบ/รายชื่อทั้งหมดก่อนยกเลิก */
    totalEntries: number;
    /** จำนวนใบ/รายชื่อที่ยกเลิกรอบนี้ */
    removedEntries: number;
    /** "ใบ" หรือ "รายชื่อ" — ใช้เขียน note ให้แอดมินอ่านรู้เรื่อง */
    unitWord: string;
  },
): Promise<number> {
  const { bookingId, eventId, depositPaid, totalEntries, removedEntries } = args;
  if (depositPaid <= 0 || totalEntries <= 0 || removedEntries <= 0) return 0;

  const alreadyForfeited = await sumForfeitedEntries(tx, bookingId);
  // กันไม่ให้ยอดยึดสะสมเกินมัดจำที่วางไว้ ไม่ว่าจะยกเลิกกี่รอบ
  const room = round2(depositPaid - alreadyForfeited);
  if (room <= 0) return 0;

  const perEntry = room / totalEntries;
  const amount = Math.min(round2(perEntry * removedEntries), room);
  if (amount <= 0) return 0;

  await tx.depositTransaction.create({
    data: {
      bookingId,
      eventId,
      type: DepositTransactionType.FORFEITED,
      amount,
      status: DepositStatus.DEPOSIT_FORFEITED,
      usedAmount: 0,
      refundAmount: 0,
      forfeitedAmount: amount,
      reason: DepositReason.CUSTOMER_CANCEL,
      reasonNotes: `ลูกค้ายกเลิก ${removedEntries} ${args.unitWord} เอง — ยึดมัดจำตามจำนวนที่ยกเลิก`,
      decidedAt: new Date(),
    },
  });

  return amount;
}

/**
 * ยึดมัดจำก้อนที่เหลือทั้งหมด (ยกเลิกทั้งคิว)
 *
 * เขียนแถวปิดจบ (type = HELD) แบบเดียวกับที่ recomputeDeposit ของแอดมินเขียน
 * เมื่อแอดมินตั้งสถานะเป็น CANCELLED — ถ้ามีแถวปิดจบอยู่แล้วก็อัปเดตทับ เพื่อไม่ให้
 * booking หนึ่งมีแถวปิดจบซ้อนกัน (หน้าแอดมินอ่านแถวเดียว)
 *
 * คืนยอดที่ยึดรอบนี้ (0 = ไม่มีมัดจำเหลือให้ยึด)
 */
export async function forfeitRemainingDeposit(
  tx: Tx,
  args: { bookingId: number; eventId: number; depositPaid: number },
): Promise<number> {
  const { bookingId, eventId, depositPaid } = args;
  if (depositPaid <= 0) return 0;

  const alreadyForfeited = await sumForfeitedEntries(tx, bookingId);
  const remaining = round2(depositPaid - alreadyForfeited);
  if (remaining <= 0) return 0;

  const existing = await tx.depositTransaction.findFirst({
    where: {
      bookingId,
      type: DepositTransactionType.HELD,
      status: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const data = {
    bookingId,
    eventId,
    type: DepositTransactionType.HELD,
    amount: remaining,
    status: DepositStatus.DEPOSIT_FORFEITED,
    usedAmount: 0,
    refundAmount: 0,
    forfeitedAmount: remaining,
    reason: DepositReason.CUSTOMER_CANCEL,
    reasonNotes: "ลูกค้ายกเลิกคิวเองผ่านหน้าติดตามสถานะ — ยึดมัดจำตามเงื่อนไขร้าน",
    decidedAt: new Date(),
  };

  if (existing) {
    await tx.depositTransaction.update({ where: { id: existing.id }, data });
  } else {
    await tx.depositTransaction.create({ data });
  }

  return remaining;
}
