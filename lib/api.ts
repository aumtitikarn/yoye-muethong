import type { BookingEvent } from "@/mockData/event.data";

/** Base URL of the backend API (yoye-admin), proxied under the same origin. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api/v1";

/**
 * Fetch the public list of bookable events shown in step 1 of the booking flow.
 * Calls GET /api/v1/public/events, which reads the shared DB and returns events
 * already mapped to the BookingEvent shape. Throws on network / server error so
 * the caller can render an error state.
 */
export async function fetchEvents(signal?: AbortSignal): Promise<BookingEvent[]> {
  const res = await fetch(`${API_BASE_URL}/public/events`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`โหลดรายการงานไม่สำเร็จ (${res.status})`);
  }
  const json = (await res.json()) as { data?: BookingEvent[] };
  return json.data ?? [];
}

// ── Omise payment (deposit step) ───────────────────────────────────

export interface OmiseChargeStatus {
  id: string;
  status: string;
  paid: boolean;
  amount: number;
  currency: string;
  authorizeUri: string | null;
  promptpayQrUri: string | null;
  failureMessage: string | null;
  /** The bookingCode reserved for this charge (created on confirmed payment). */
  bookingCode?: string;
}

/** Thrown when the charge/confirm call requires a LINE login (HTTP 401). */
export class PaymentAuthError extends Error {}

export interface CreateChargeInput {
  /** Card token ("tokn_…") or payment source ("src_…") from Omise.js. */
  nonce: string;
  eventId: number;
  /** Customer's contact phone (required — stored on the customer record). */
  phone?: string;
  /** FORM events: number of names. */
  count?: number;
  /** TICKET events: selected round/zone line items. */
  items?: Array<{ roundId: number; zoneId: number; quantity: number }>;
  notes?: string;
  nameCustomer?: string;
}

/**
 * Create an Omise charge from a client-side nonce. Requires a LINE session —
 * the server computes the deposit, reserves a bookingCode, and stashes the
 * booking details in the charge metadata. Throws PaymentAuthError on 401.
 */
export async function createOmiseCharge(
  input: CreateChargeInput
): Promise<OmiseChargeStatus> {
  const res = await fetch(`${API_BASE_URL}/public/payments/omise/charge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: OmiseChargeStatus; message?: string }
    | null;
  if (res.status === 401) {
    throw new PaymentAuthError(json?.message ?? "กรุณาเข้าสู่ระบบด้วย LINE ก่อน");
  }
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? `ชำระเงินไม่สำเร็จ (${res.status})`);
  }
  return json.data;
}

/**
 * Confirm a paid charge so the booking is recorded (idempotent server-side).
 * Called by the client once polling sees the charge as successful.
 */
export async function confirmOmiseCharge(
  chargeId: string
): Promise<{ bookingCode: string; created: boolean }> {
  const res = await fetch(`${API_BASE_URL}/public/payments/omise/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chargeId }),
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: { bookingCode: string; created: boolean }; message?: string }
    | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? "บันทึกการจองไม่สำเร็จ");
  }
  return json.data;
}

/** Poll the current status of a charge (for PromptPay / redirect methods). */
export async function getOmiseChargeStatus(
  chargeId: string,
  signal?: AbortSignal
): Promise<Pick<OmiseChargeStatus, "id" | "status" | "paid" | "failureMessage">> {
  const res = await fetch(
    `${API_BASE_URL}/public/payments/omise/charge/${encodeURIComponent(chargeId)}`,
    { signal, cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as {
    data?: Pick<OmiseChargeStatus, "id" | "status" | "paid" | "failureMessage">;
    message?: string;
  } | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? "ตรวจสอบสถานะไม่สำเร็จ");
  }
  return json.data;
}

// ── Omise payment (service fee / ค่ากด step) ──────────────────────

export interface ServiceFeeInfo {
  bookingCode: string;
  eventName: string;
  quantity: number;
  feePerEntry: number;
  amountBaht: number;
  payable: boolean;
  alreadyPaid: boolean;
  status: string;
}

/** Fetch the ค่ากด amount + payability for the caller's own booking. */
export async function fetchServiceFeeInfo(
  bookingCode: string,
  signal?: AbortSignal
): Promise<ServiceFeeInfo> {
  const res = await fetch(
    `${API_BASE_URL}/public/payments/service-fee/${encodeURIComponent(bookingCode)}`,
    { signal, cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: ServiceFeeInfo; message?: string }
    | null;
  if (res.status === 401) {
    throw new PaymentAuthError(json?.message ?? "กรุณาเข้าสู่ระบบด้วย LINE ก่อน");
  }
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? `โหลดข้อมูลไม่สำเร็จ (${res.status})`);
  }
  return json.data;
}

/**
 * Create an Omise charge for a booking's service fee (ค่ากด). Requires a LINE
 * session + ownership; the server recomputes the amount. Throws PaymentAuthError
 * on 401 so the caller can prompt for login.
 */
export async function createServiceFeeCharge(input: {
  nonce: string;
  bookingCode: string;
}): Promise<OmiseChargeStatus> {
  const res = await fetch(
    `${API_BASE_URL}/public/payments/service-fee/charge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: OmiseChargeStatus; message?: string }
    | null;
  if (res.status === 401) {
    throw new PaymentAuthError(json?.message ?? "กรุณาเข้าสู่ระบบด้วย LINE ก่อน");
  }
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? `ชำระเงินไม่สำเร็จ (${res.status})`);
  }
  return json.data;
}

/** Confirm a paid ค่ากด charge so the booking is settled (idempotent server-side). */
export async function confirmServiceFeeCharge(
  chargeId: string
): Promise<{ bookingCode: string; created: boolean }> {
  const res = await fetch(
    `${API_BASE_URL}/public/payments/service-fee/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId }),
    }
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: { bookingCode: string; created: boolean }; message?: string }
    | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? "บันทึกการชำระเงินไม่สำเร็จ");
  }
  return json.data;
}

// ── Ticket fee (ค่าบัตร / ฝากจ่าย) ─────────────────────────────────

export interface TicketFeeInfo {
  bookingCode: string;
  eventName: string;
  showDateTime: string | null;
  ticketZone: string | null;
  ticketQty: string | null;
  amountBaht: number;
  dueAt: string | null;
  dueText: string | null;
  payable: boolean;
  alreadyPaid: boolean;
  status: string;
}

/** Fetch the ค่าบัตร amount + payability for the caller's own booking. */
export async function fetchTicketFeeInfo(
  bookingCode: string,
  signal?: AbortSignal
): Promise<TicketFeeInfo> {
  const res = await fetch(
    `${API_BASE_URL}/public/payments/ticket-fee/${encodeURIComponent(bookingCode)}`,
    { signal, cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: TicketFeeInfo; message?: string }
    | null;
  if (res.status === 401) {
    throw new PaymentAuthError(json?.message ?? "กรุณาเข้าสู่ระบบด้วย LINE ก่อน");
  }
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? `โหลดข้อมูลไม่สำเร็จ (${res.status})`);
  }
  return json.data;
}

/**
 * Create an Omise charge for a booking's ticket fee (ค่าบัตร / ฝากจ่าย).
 * Requires a LINE session + ownership; the server reads the amount from the
 * admin's notice. Throws PaymentAuthError on 401 so the caller can prompt login.
 */
export async function createTicketFeeCharge(input: {
  nonce: string;
  bookingCode: string;
}): Promise<OmiseChargeStatus> {
  const res = await fetch(
    `${API_BASE_URL}/public/payments/ticket-fee/charge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: OmiseChargeStatus; message?: string }
    | null;
  if (res.status === 401) {
    throw new PaymentAuthError(json?.message ?? "กรุณาเข้าสู่ระบบด้วย LINE ก่อน");
  }
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? `ชำระเงินไม่สำเร็จ (${res.status})`);
  }
  return json.data;
}

/** Confirm a paid ค่าบัตร charge so the booking is settled (idempotent server-side). */
export async function confirmTicketFeeCharge(
  chargeId: string
): Promise<{ bookingCode: string; created: boolean }> {
  const res = await fetch(
    `${API_BASE_URL}/public/payments/ticket-fee/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId }),
    }
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: { bookingCode: string; created: boolean }; message?: string }
    | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? "บันทึกการชำระเงินไม่สำเร็จ");
  }
  return json.data;
}

// ── Tracking (customer bookings) ───────────────────────────────────

export interface TrackingRowDTO {
  bookingId: string;
  concertName: string;
  showTime: string;
  zone: string;
  status: string;
  paymentDeadline: string | null;
  totalPrice: number;
  /** True when the customer has already saved extra-field answers for this booking. */
  haveDeepInfo: boolean;
  /** True when the customer has already submitted refund bank info for this booking. */
  haveRefundInfo: boolean;
  /** True while the customer may still cancel this queue themselves (deposit forfeited). */
  canCancel: boolean;
}

export type FetchBookingsResult =
  | { ok: true; rows: TrackingRowDTO[] }
  | { ok: false; status: number; error: string };

/**
 * Fetch the logged-in (LINE) customer's real bookings for the tracking page.
 * Returns a discriminated result so the caller can distinguish "not logged in"
 * (401) from other errors and render the right prompt.
 */
export async function fetchBookings(
  signal?: AbortSignal
): Promise<FetchBookingsResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/bookings`, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      return {
        ok: false,
        status: res.status,
        error: json?.message ?? `โหลดข้อมูลไม่สำเร็จ (${res.status})`,
      };
    }
    const json = (await res.json()) as { data?: TrackingRowDTO[] };
    return { ok: true, rows: json.data ?? [] };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ",
    };
  }
}

/**
 * Cancel the caller's own queue. Requires a LINE session + ownership and only
 * works before pressing starts (both enforced server-side). The deposit is
 * forfeited. Throws on failure so the caller can surface the message.
 */
export async function cancelBooking(bookingCode: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/public/bookings/${encodeURIComponent(bookingCode)}/cancel`,
    { method: "POST" }
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(json?.message ?? `ยกเลิกการจองไม่สำเร็จ (${res.status})`);
  }
}

/**
 * Cancel specific booked names/tickets on the caller's own booking. The deposit
 * for the dropped slots is not refunded. Throws on failure so the caller can
 * surface the message.
 */
export async function cancelBookingEntries(
  bookingCode: string,
  removeEntryIndexes: number[]
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/public/bookings/${encodeURIComponent(bookingCode)}/entries`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeEntryIndexes }),
    }
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(json?.message ?? `ยกเลิกรายการไม่สำเร็จ (${res.status})`);
  }
}

// ── Booking detail (single booking, owner-only) ────────────────────

export interface DeepInfoFieldDTO {
  id: number;
  otherCode: string;
  label: string;
  isRequired: boolean;
}

/**
 * One booked name/ticket's worth of answers. A booking for 3 รายชื่อ gets three
 * of these (entryIndex 1..3), each carrying an answer for every field.
 */
export interface DeepInfoEntryDTO {
  /** 1-based — "รายชื่อที่ 1", "รายชื่อที่ 2", … */
  entryIndex: number;
  /** fieldId (as a string key) -> answer. */
  values: Record<string, string>;
  /** Zone this slot belongs to (ticket events); null for form bookings. */
  zoneName: string | null;
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
  feePerEntry: number;
  /** Deposit already paid (มัดจำ). */
  depositPaid: number;
  /** Admin-set refund total (฿) once awaiting a refund. */
  refundAmount: number;
  /** Coarse customer-facing status. */
  trackingStatus: string;
  note?: string;
  zones: ZoneOptionDTO[];
  /** Field definitions for this event (the same set repeats for every entry). */
  fields: DeepInfoFieldDTO[];
  /** Always exactly `quantity` items, blanks included, ordered by entryIndex. */
  entries: DeepInfoEntryDTO[];
}

/** Fetch full detail of the caller's own booking (incl. admin extra fields). */
export async function fetchBookingDetail(
  bookingCode: string,
  signal?: AbortSignal
): Promise<BookingDetailDTO> {
  const res = await fetch(
    `${API_BASE_URL}/public/bookings/${encodeURIComponent(bookingCode)}`,
    { signal, cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: BookingDetailDTO; message?: string }
    | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? `โหลดข้อมูลไม่สำเร็จ (${res.status})`);
  }
  return json.data;
}

// ── Deep info responses (extra fields on the booking detail page) ──

export interface DeepInfoResponseInput {
  fieldId: number;
  /** 1-based booked name/ticket this answer belongs to. */
  entryIndex: number;
  value: string;
}

/**
 * Save the caller's answers to the event's extra fields (deep_info_responses)
 * for a booking. Requires a LINE session + ownership (enforced server-side).
 * Throws on failure so the caller can surface the message.
 */
export async function saveDeepInfoResponses(
  bookingCode: string,
  responses: DeepInfoResponseInput[]
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/public/bookings/${encodeURIComponent(bookingCode)}/deep-info`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responses }),
    }
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(json?.message ?? `บันทึกข้อมูลไม่สำเร็จ (${res.status})`);
  }
}

export interface RefundInfoInput {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
}

/**
 * Save the caller's refund bank details for a booking that is awaiting a
 * refund. Requires a LINE session + ownership (enforced server-side). Throws
 * on failure so the caller can surface the message.
 */
export async function submitRefundInfo(
  bookingCode: string,
  input: RefundInfoInput
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/public/bookings/${encodeURIComponent(bookingCode)}/refund`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(json?.message ?? `บันทึกข้อมูลคืนเงินไม่สำเร็จ (${res.status})`);
  }
}

// ── Refund summary (bank info + payout history) ────────────────────

export interface RefundAccountDTO {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
  status: string;
  requestedAt: string;
}

export interface RefundTransactionDTO {
  id: number;
  amount: number;
  paidAt: string;
  payoutSlipUrl: string | null;
  status: string;
}

export interface RefundSummaryDTO {
  refundAmount: number;
  trackingStatus: string;
  editable: boolean;
  account: RefundAccountDTO | null;
  transactions: RefundTransactionDTO[];
}

/**
 * Fetch the refund summary for the caller's own booking: admin-set amount, the
 * latest bank info submitted, and any payouts the shop has already made.
 * Throws PaymentAuthError on 401 so the caller can prompt for LINE login.
 */
export async function fetchRefundInfo(
  bookingCode: string,
  signal?: AbortSignal
): Promise<RefundSummaryDTO> {
  const res = await fetch(
    `${API_BASE_URL}/public/bookings/${encodeURIComponent(bookingCode)}/refund`,
    { signal, cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: RefundSummaryDTO; message?: string }
    | null;
  if (res.status === 401) {
    throw new PaymentAuthError(json?.message ?? "กรุณาเข้าสู่ระบบด้วย LINE ก่อน");
  }
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? `โหลดข้อมูลคืนเงินไม่สำเร็จ (${res.status})`);
  }
  return json.data;
}

export interface LinkLineInput {
  bookingCode: string;
  phoneLast4: string;
}

export type LinkLineResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Link the logged-in customer's LINE account to their booking so the admin can
 * push LINE messages. Calls POST /api/v1/public/line/link, which verifies
 * bookingCode + last-4 of phone and reads the LINE userId from the session.
 */
export async function linkLineAccount(
  input: LinkLineInput
): Promise<LinkLineResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/line/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      let message = `เกิดข้อผิดพลาด (${res.status})`;
      try {
        const data = await res.json();
        message = data?.message ?? data?.error?.message ?? data?.error ?? message;
      } catch {
        // response had no JSON body
      }
      return { ok: false, error: message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ",
    };
  }
}

// ── Reviews (public /reviews page) ─────────────────────────────────

export interface ReviewDTO {
  id: number;
  eventName: string;
  /** null = ลูกค้าไม่เปิดเผยชื่อ */
  customerName: string | null;
  imageUrl: string;
  content: string | null;
  /** ISO date string. */
  reviewDate: string;
}

export interface ReviewListResult {
  data: ReviewDTO[];
  total: number;
  totalPages: number;
}

export interface ReviewStats {
  totalVisitors: number;
  totalBookings: number;
  successPresses: number;
}

/** Published customer reviews, paginated + searchable by event/customer name. */
export async function fetchReviews(
  params: { search?: string; page?: number; pageSize?: number },
  signal?: AbortSignal
): Promise<ReviewListResult> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));

  const res = await fetch(`${API_BASE_URL}/public/reviews?${query.toString()}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`โหลดรีวิวไม่สำเร็จ (${res.status})`);
  const json = (await res.json()) as {
    data?: ReviewDTO[];
    pagination?: { total: number; totalPages: number };
  };
  return {
    data: json.data ?? [],
    total: json.pagination?.total ?? 0,
    totalPages: json.pagination?.totalPages ?? 1,
  };
}

/** Headline numbers for the reviews page (visitors / bookings / presses). */
export async function fetchReviewStats(
  signal?: AbortSignal
): Promise<ReviewStats> {
  const res = await fetch(`${API_BASE_URL}/public/reviews/stats`, { signal });
  if (!res.ok) throw new Error(`โหลดสถิติไม่สำเร็จ (${res.status})`);
  const json = (await res.json()) as { data?: ReviewStats };
  return (
    json.data ?? { totalVisitors: 0, totalBookings: 0, successPresses: 0 }
  );
}
