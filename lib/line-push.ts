/**
 * LINE Messaging API push helpers (customer notifications).
 *
 * Separate from lib/line.ts (which is LINE *Login* / OAuth). Push uses the
 * Messaging API channel access token (LINE_CHANNEL_ACCESS_TOKEN) and can only
 * reach users who have added the Official Account as a friend — the login flow
 * asks for that with `bot_prompt=aggressive`.
 *
 * Docs: https://developers.line.biz/en/reference/messaging-api/#send-push-message
 */

const PUSH_URL = "https://api.line.me/v2/bot/message/push";

/**
 * Push a plain-text message to a single LINE user. Best-effort: returns false
 * (and logs) on any failure instead of throwing, so a LINE outage never breaks
 * the caller's main flow (e.g. booking creation).
 */
export async function pushLineTextMessage(
  to: string,
  text: string,
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("pushLineTextMessage: LINE_CHANNEL_ACCESS_TOKEN not set");
    return false;
  }
  if (!to) return false;

  try {
    const res = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`LINE push failed (${res.status}): ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("LINE push error:", err);
    return false;
  }
}

export interface BookingConfirmedMessageParams {
  bookingId: string;
  eventName: string;
}

/**
 * จองคิวสำเร็จ — sent right after a customer's deposit is settled and the booking
 * enters QUEUE_BOOKED. A settled deposit confirms the queue outright (there is no
 * admin-approval step), so this message confirms the booking and points the
 * customer at the next step: filling in the booking info.
 */
export function buildBookingConfirmedMessage({
  bookingId,
  eventName,
}: BookingConfirmedMessageParams): string {
  return [
    "📢 𝚋𝚘𝚘𝚔𝚒𝚗𝚐 𝚗𝚘𝚝𝚒𝚌𝚎 : จองคิวสำเร็จแล้วค่ะ ♡ 🎉",
    `🧾 รหัสการจอง : ${bookingId}`,
    `🎫 งาน : ${eventName}`,
    "ทางร้านได้รับมัดจำและยืนยันการจองคิวของลูกค้าเรียบร้อยแล้วนะคะ 💖",
    "📌 ขั้นตอนถัดไป รบกวนลูกค้ากรอกข้อมูลสำหรับกดบัตรให้ครบถ้วนภายในเวลาที่ร้านกำหนดนะคะ 💌",
    "หากข้อมูลไม่ครบถ้วน อาจส่งผลให้ร้านไม่สามารถดำเนินการกดบัตรได้ทันเวลาค่ะ 🐰✨",
  ].join("\n");
}

export interface TicketPaymentReviewMessageParams {
  bookingId: string;
  eventName: string;
  amount: number;
}

/**
 * ตรวจสอบยอดโอนค่าบัตร — sent right after a customer pays the ค่าบัตร (ฝากจ่าย)
 * via Omise and the booking enters CONFIRMING_TICKET, telling them the transfer
 * is now under admin review.
 */
export function buildTicketPaymentReviewMessage({
  bookingId,
  eventName,
  amount,
}: TicketPaymentReviewMessageParams): string {
  return [
    "📢 𝚙𝚊𝚢𝚖𝚎𝚗𝚝 𝚛𝚎𝚟𝚒𝚎𝚠 : อยู่ระหว่างตรวจสอบยอดโอนค่ะ ♡ 🧾💸",
    `🧾 รหัสการจอง : ${bookingId}`,
    `🎫 งาน : ${eventName}`,
    `💸 ยอดที่แจ้งชำระ : ${amount.toLocaleString()} บาท`,
    "ทางร้านได้รับหลักฐานการโอนค่าบัตรจากลูกค้าเรียบร้อยแล้วนะคะ 💖",
    "ขณะนี้แอดมินอยู่ระหว่างตรวจสอบยอดชำระค่ะ",
    "หากยอดถูกต้องครบถ้วน",
    "ร้านจะอัปเดตสถานะและดำเนินการขั้นตอนถัดไปให้นะคะ",
    "ขอบคุณที่รอสักครู่นะคะ 🐰🎀",
  ].join("\n");
}
