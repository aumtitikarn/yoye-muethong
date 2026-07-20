import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchEvents,
  fetchBookings,
  fetchBookingDetail,
  fetchServiceFeeInfo,
  saveDeepInfoResponses,
  PaymentAuthError,
  type DeepInfoResponseInput,
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
