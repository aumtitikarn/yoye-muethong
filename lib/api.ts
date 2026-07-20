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

// ── Booking detail (single booking, owner-only) ────────────────────

export interface DeepInfoFieldDTO {
  id: number;
  otherCode: string;
  label: string;
  isRequired: boolean;
  /** The customer's previously saved answer, if any. */
  value: string;
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
  note?: string;
  zones: ZoneOptionDTO[];
  fields: DeepInfoFieldDTO[];
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
