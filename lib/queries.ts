import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelBooking,
  cancelBookingEntries,
  fetchEvents,
  fetchBookings,
  fetchBookingDetail,
  fetchServiceFeeInfo,
  fetchTicketFeeInfo,
  fetchRefundInfo,
  fetchReviews,
  fetchReviewStats,
  saveDeepInfoResponses,
  submitRefundInfo,
  PaymentAuthError,
  type DeepInfoResponseInput,
  type RefundInfoInput,
} from "./api";

/** Server state: bookable events for step 1 of the booking flow. */
export function useEventsQuery() {
  return useQuery({
    queryKey: ["events"],
    queryFn: ({ signal }) => fetchEvents(signal),
  });
}

/** Error thrown by the bookings query, carrying the HTTP status. */
export class BookingsError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BookingsError";
    this.status = status;
  }
}

/**
 * Server state: the logged-in customer's bookings (tracking page). Throws a
 * BookingsError on failure so callers can tell "not logged in" (401) apart from
 * other errors. 401 is not retried.
 */
export function useBookingsQuery() {
  return useQuery({
    queryKey: ["bookings"],
    queryFn: async ({ signal }) => {
      const result = await fetchBookings(signal);
      if (!result.ok) throw new BookingsError(result.status, result.error);
      return result.rows;
    },
    retry: (failureCount, error) =>
      !(error instanceof BookingsError && error.status === 401) &&
      failureCount < 1,
  });
}

/** Server state: full detail of a single booking (owner-only). */
export function useBookingDetailQuery(bookingCode: string | undefined) {
  return useQuery({
    queryKey: ["booking-detail", bookingCode],
    queryFn: ({ signal }) => fetchBookingDetail(bookingCode as string, signal),
    enabled: Boolean(bookingCode),
  });
}

/**
 * Server state: the ค่ากด amount + payability for a single booking (owner-only).
 * A 401 (not logged in) is surfaced as PaymentAuthError and not retried so the
 * payment page can prompt for LINE login.
 */
export function useServiceFeeInfoQuery(bookingCode: string | undefined) {
  return useQuery({
    queryKey: ["service-fee-info", bookingCode],
    queryFn: ({ signal }) => fetchServiceFeeInfo(bookingCode as string, signal),
    enabled: Boolean(bookingCode),
    retry: (failureCount, error) =>
      !(error instanceof PaymentAuthError) && failureCount < 1,
  });
}

export function useTicketFeeInfoQuery(bookingCode: string | undefined) {
  return useQuery({
    queryKey: ["ticket-fee-info", bookingCode],
    queryFn: ({ signal }) => fetchTicketFeeInfo(bookingCode as string, signal),
    enabled: Boolean(bookingCode),
    retry: (failureCount, error) =>
      !(error instanceof PaymentAuthError) && failureCount < 1,
  });
}

/**
 * Server state: the refund summary (amount, bank info, payout history) for a
 * single booking (owner-only). A 401 is surfaced as PaymentAuthError and not
 * retried so the refund step can prompt for LINE login.
 */
export function useRefundInfoQuery(bookingCode: string | undefined) {
  return useQuery({
    queryKey: ["refund-info", bookingCode],
    queryFn: ({ signal }) => fetchRefundInfo(bookingCode as string, signal),
    enabled: Boolean(bookingCode),
    retry: (failureCount, error) =>
      !(error instanceof PaymentAuthError) && failureCount < 1,
  });
}

/** Save the booking's extra-field answers (deep_info_responses). */
export function useSaveDeepInfoMutation(bookingCode: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (responses: DeepInfoResponseInput[]) =>
      saveDeepInfoResponses(bookingCode as string, responses),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["booking-detail", bookingCode],
      });
    },
  });
}

/**
 * Cancel one of the customer's own queues (deposit forfeited). Takes the
 * booking code per call so a single hook can serve every row on the tracking
 * page.
 */
export function useCancelBookingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingCode: string) => cancelBooking(bookingCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking-detail"] });
    },
  });
}

/**
 * Cancel specific booked names/tickets on a booking (ลดจำนวน). The deposit for
 * the dropped slots is not refunded.
 */
export function useCancelBookingEntriesMutation(bookingCode: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (removeEntryIndexes: number[]) =>
      cancelBookingEntries(bookingCode as string, removeEntryIndexes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({
        queryKey: ["booking-detail", bookingCode],
      });
    },
  });
}

/** Save the customer's refund bank info for a booking awaiting a refund. */
export function useSubmitRefundMutation(bookingCode: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RefundInfoInput) =>
      submitRefundInfo(bookingCode as string, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["refund-info", bookingCode] });
    },
  });
}

// Reviews and their headline numbers are admin-curated and change rarely, so
// they get a much longer client cache than the app-wide 30s default: pages
// already visited render instantly and revisiting the tab doesn't refetch.
const REVIEWS_STALE_MS = 5 * 60_000;
const REVIEWS_GC_MS = 30 * 60_000;

/** Server state: published customer reviews for the public /reviews page. */
export function useReviewsQuery(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ["reviews", params],
    queryFn: ({ signal }) => fetchReviews(params, signal),
    // Keep the previous page on screen while the next one loads.
    placeholderData: (prev) => prev,
    staleTime: REVIEWS_STALE_MS,
    gcTime: REVIEWS_GC_MS,
    refetchOnWindowFocus: false,
  });
}

/** Server state: headline stats shown above the review grid. */
export function useReviewStatsQuery() {
  return useQuery({
    queryKey: ["review-stats"],
    queryFn: ({ signal }) => fetchReviewStats(signal),
    staleTime: REVIEWS_STALE_MS,
    gcTime: REVIEWS_GC_MS,
    refetchOnWindowFocus: false,
  });
}
