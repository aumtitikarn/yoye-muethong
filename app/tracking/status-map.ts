import type { BookingStatus } from "@prisma/client";
import { TrackingStatus } from "./types/enum";

/**
 * Map yoye-admin's fine-grained BookingStatus (28 states) onto the storefront's
 * customer-facing TrackingStatus (12 states). This is intentionally lossy — the
 * customer sees a coarse, friendly status; the admin keeps the detail.
 */
const STATUS_MAP: Record<BookingStatus, TrackingStatus> = {
  WAITING_QUEUE_APPROVAL: TrackingStatus.BOOKING_CONFIRMED,
  WAITING_DEPOSIT_TRANSFER: TrackingStatus.WAIT_FULL_PAYMENT,
  WAITING_DEPOSIT_VERIFY: TrackingStatus.BOOKING_CONFIRMED,
  QUEUE_BOOKED: TrackingStatus.BOOKING_CONFIRMED,
  WAITING_BOOKING_INFO: TrackingStatus.BOOKING_CONFIRMED,
  TRANSFERRING_TICKET: TrackingStatus.WAIT_FULL_PAYMENT,
  CONFIRMING_TICKET: TrackingStatus.PREPARE_PRESS,
  WAITING_ADMIN_CONFIRM: TrackingStatus.PREPARE_PRESS,
  READY_TO_BOOK: TrackingStatus.PREPARE_PRESS,
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
  WAITING_SERVICE_FEE: TrackingStatus.WAIT_SERVICE_FEE,
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
