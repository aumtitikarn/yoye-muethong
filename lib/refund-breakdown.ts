import type { Prisma } from "@prisma/client";

/**
 * How the admin split a refund total in the "แจ้งเงินคืน" dialog (yoye-admin,
 * /payments). It is stored as free-form JSON on `refund_requests.breakdown`, so
 * the storefront normalises it here before showing the customer — a customer who
 * only sees "คืน 500 บาท" has no way to check the shop's arithmetic.
 *
 * Keys and labels mirror yoye-admin's `refundBreakdownItems`; keep them in sync.
 */
export const REFUND_BREAKDOWN_ITEMS = [
  { key: "ticket", label: "คืนค่าบัตร" },
  { key: "deposit", label: "คืนค่ามัดจำ" },
  { key: "priceDiff", label: "คืนส่วนต่างหลังหักค่ากด" },
  { key: "shipping", label: "คืนค่าส่ง" },
  { key: "other", label: "อื่น ๆ" },
] as const;

export interface RefundBreakdownItemDTO {
  key: string;
  label: string;
  amount: number;
}

/**
 * Turn the stored JSON into labelled rows, dropping anything zero/absent so the
 * customer only reads the lines that actually make up their refund. Unknown keys
 * are ignored — the admin schema is the source of truth for what may appear.
 */
export function refundBreakdownItems(
  raw: Prisma.JsonValue | null | undefined,
): RefundBreakdownItemDTO[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const obj = raw as Record<string, unknown>;
  return REFUND_BREAKDOWN_ITEMS.flatMap(({ key, label }) => {
    const amount = Number(obj[key] ?? 0);
    return Number.isFinite(amount) && amount !== 0
      ? [{ key, label, amount }]
      : [];
  });
}
