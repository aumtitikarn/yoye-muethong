import type { BookingStatus } from "@prisma/client";
import { TrackingStatus } from "./types/enum";

/**
 * Map yoye-admin's fine-grained BookingStatus (32 states) onto the storefront's
 * customer-facing TrackingStatus (16 states). This is intentionally lossy — the
 * customer sees a coarse, friendly status; the admin keeps the detail.
 */
const STATUS_MAP: Record<BookingStatus, TrackingStatus> = {
  WAITING_DEPOSIT_TRANSFER: TrackingStatus.WAIT_FULL_PAYMENT,
  WAITING_DEPOSIT_VERIFY: TrackingStatus.BOOKING_CONFIRMED,
  QUEUE_BOOKED: TrackingStatus.BOOKING_CONFIRMED,
  // แอดมินขอข้อมูลเพิ่ม → หน้าติดตามต้องโชว์ปุ่มกรอกข้อมูลเพิ่มเติม
  WAITING_BOOKING_INFO: TrackingStatus.WAIT_BOOKING_INFO,
  BOOKING_INFO_SUBMITTED: TrackingStatus.INFO_SUBMITTED,
  TRANSFERRING_TICKET: TrackingStatus.WAIT_FULL_PAYMENT,
  CONFIRMING_TICKET: TrackingStatus.PREPARE_PRESS,
  WAITING_ADMIN_CONFIRM: TrackingStatus.WAIT_ADMIN_CONFIRM,
  READY_TO_BOOK: TrackingStatus.READY_TO_PRESS,
  BOOKING_IN_PROGRESS: TrackingStatus.PRESSING,
  PARTIALLY_BOOKED: TrackingStatus.PARTIAL_TICKETS,
  FULLY_BOOKED: TrackingStatus.COMPLETE_TICKETS,
  BOOKING_FAILED: TrackingStatus.FAILED,
  CUSTOMER_SELF_BOOKED: TrackingStatus.PRESSING,
  TEAM_NOT_RECEIVED: TrackingStatus.PRESSING,
  TEAM_BOOKED: TrackingStatus.COMPLETE_TICKETS,
  PARTIAL_SELF_TEAM_BOOKING: TrackingStatus.PARTIAL_TICKETS,
  FORM_WAITING_RESULT: TrackingStatus.PRESSING,
  FORM_MISSED: TrackingStatus.WAIT_REFUND,
  // มีรายชื่อ → ลูกค้าต้องชำระค่ากด ให้แสดงปุ่มชำระเงินบนหน้าติดตาม
  FORM_HAS_NAME: TrackingStatus.WAIT_SERVICE_FEE,
  FORM_NO_NAME: TrackingStatus.WAIT_REFUND,
  WAITING_SUMMARY: TrackingStatus.PRESSING,
  // แอดมินยังไม่ได้สร้างบิล → ลูกค้ายังจ่ายไม่ได้ (ปุ่มชำระเงินจะขึ้นตอน
  // WAITING_SERVICE_FEE_VERIFY คือหลังบิลถูกสร้างแล้ว)
  WAITING_SERVICE_FEE: TrackingStatus.WAIT_ADMIN_SUMMARY,
  WAITING_SERVICE_FEE_VERIFY: TrackingStatus.WAIT_SERVICE_FEE,
  SERVICE_FEE_PAID: TrackingStatus.PREPARE_PRESS,
  DEPOSIT_PENDING: TrackingStatus.BOOKING_CONFIRMED,
  DEPOSIT_USED: TrackingStatus.DONE,
  DEPOSIT_FORFEITED: TrackingStatus.CANCEL,
  WAITING_REFUND: TrackingStatus.WAIT_REFUND,
  REFUNDED: TrackingStatus.REFUNDED,
  COMPLETED: TrackingStatus.DONE,
  CANCELLED: TrackingStatus.CANCEL,
  CLOSED_REFUNDED: TrackingStatus.REFUNDED,
};

export function toTrackingStatus(status: BookingStatus): TrackingStatus {
  return STATUS_MAP[status] ?? TrackingStatus.BOOKING_CONFIRMED;
}

/**
 * Statuses a customer may cancel their own queue from — everything before the
 * team starts pressing. Once pressing has begun (or the booking has moved into
 * a money / terminal stage) the outcome is no longer the customer's to decide,
 * so those cancellations go through an admin instead.
 *
 * Single source of truth: the tracking page uses it to decide whether to show
 * the button, and POST /public/bookings/:code/cancel enforces it server-side.
 */
const CANCELLABLE_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "WAITING_DEPOSIT_TRANSFER",
  "WAITING_DEPOSIT_VERIFY",
  "QUEUE_BOOKED",
  "WAITING_BOOKING_INFO",
  "BOOKING_INFO_SUBMITTED",
  "TRANSFERRING_TICKET",
  "CONFIRMING_TICKET",
  "WAITING_ADMIN_CONFIRM",
  "READY_TO_BOOK",
] satisfies BookingStatus[]);

/** True when the customer may still cancel this booking themselves. */
export function canCancelBooking(status: BookingStatus): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

/** Array form, for Prisma `status: { in: ... }` filters. */
export const cancellableStatuses = (): BookingStatus[] => [
  ...CANCELLABLE_STATUSES,
];
