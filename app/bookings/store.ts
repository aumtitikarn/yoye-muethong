import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BookingEvent } from "./components/event";
import { steps } from "./components/stepBooking";

export type BookingFormData = {
  nickName: string;
  phone: string;
  showTimeId: string;
  zoneId: string;
  ticketCount: number;
  notes: string;
  nameList?: string[];
};

const PAYMENT_TIMEOUT_MS = 10 * 60 * 1000;
const FIRST_STEP = steps[0].id;
const PAYMENT_STEP = steps[3].id;

interface BookingState {
  step: number;
  selectedEvent: BookingEvent | null;
  paymentStartedAt: number | null;
  bookingForm: BookingFormData | null;
  /** Ephemeral — not persisted; derived from the payment countdown. */
  isExpired: boolean;

  selectEvent: (event: BookingEvent) => void;
  goToStep: (step: number) => void;
  setBookingForm: (form: BookingFormData) => void;
  setExpired: () => void;
  /** Flip to expired if the payment window has elapsed (called on mount). */
  checkExpiry: () => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>()(
  persist(
    (set, get) => ({
      step: FIRST_STEP,
      selectedEvent: null,
      paymentStartedAt: null,
      bookingForm: null,
      isExpired: false,

      selectEvent: (event) =>
        set({ selectedEvent: event, step: steps[1].id }),

      goToStep: (step) =>
        set(
          step === PAYMENT_STEP
            ? { step, paymentStartedAt: Date.now() }
            : { step },
        ),

      setBookingForm: (form) => set({ bookingForm: form }),

      setExpired: () => set({ isExpired: true }),

      checkExpiry: () => {
        const { step, paymentStartedAt } = get();
        if (
          step === PAYMENT_STEP &&
          paymentStartedAt &&
          Date.now() - paymentStartedAt >= PAYMENT_TIMEOUT_MS
        ) {
          set({ isExpired: true });
        }
      },

      reset: () =>
        set({
          step: FIRST_STEP,
          selectedEvent: null,
          paymentStartedAt: null,
          bookingForm: null,
          isExpired: false,
        }),
    }),
    {
      name: "yoye_booking_state",
      storage: createJSONStorage(() => localStorage),
      // isExpired is derived, never persisted.
      partialize: ({ step, selectedEvent, paymentStartedAt, bookingForm }) => ({
        step,
        selectedEvent,
        paymentStartedAt,
        bookingForm,
      }),
    },
  ),
);
