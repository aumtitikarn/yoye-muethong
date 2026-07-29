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

export interface QueueReviewMessageParams {
  bookingId: string;
  eventName: string;
}

/**
 * รอแอดมินอนุมัติคิว — sent right after a customer's deposit is settled and the
 * booking enters WAITING_QUEUE_APPROVAL, telling them the queue is now pending
 * admin review.
 */
export function buildQueueReviewMessage({
  bookingId,
  eventName,
}: QueueReviewMessageParams): string {
  return [
    "📢 𝚚𝚞𝚎𝚞𝚎 𝚛𝚎𝚟𝚒𝚎𝚠 : อยู่ระหว่างรออนุมัติคิวค่ะ ♡ 📝🎀",
    `🧾 รหัสการจอง : ${bookingId}`,
    `🎫 งาน : ${eventName}`,
    "ทางร้านได้รับข้อมูลการจองเรียบร้อยแล้วนะคะ 💖",
    "ขณะนี้รายการอยู่ระหว่างรอแอดมินตรวจสอบและอนุมัติคิวค่ะ",
    "หากข้อมูลถูกต้องครบถ้วนแล้ว",
    "แอดมินจะอัปเดตสถานะถัดไปให้ลูกค้าทราบนะคะ 🐰✨",
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
