"use client";

import { useEffect, useState } from "react";
import Condition from "./components/condition";
import Event from "./components/event";
import Loading from "@/components/Loading";
import { steps } from "./components/stepBooking";
import BookingInfo from "./components/bookings";
import Payment from "./components/payment";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { useBookingStore } from "./store";

export type { BookingFormData } from "./store";

export default function Bookings() {
  // Gate rendering until the client has mounted so the persisted (localStorage)
  // store state doesn't clash with the server-rendered HTML.
  const [mounted, setMounted] = useState(false);

  const step = useBookingStore((s) => s.step);
  const selectedEvent = useBookingStore((s) => s.selectedEvent);
  const paymentStartedAt = useBookingStore((s) => s.paymentStartedAt);
  const bookingForm = useBookingStore((s) => s.bookingForm);
  const isExpired = useBookingStore((s) => s.isExpired);

  const selectEvent = useBookingStore((s) => s.selectEvent);
  const goToStep = useBookingStore((s) => s.goToStep);
  const setBookingForm = useBookingStore((s) => s.setBookingForm);
  const setExpired = useBookingStore((s) => s.setExpired);
  const checkExpiry = useBookingStore((s) => s.checkExpiry);
  const reset = useBookingStore((s) => s.reset);

  useEffect(() => {
    checkExpiry();
    // Client-mounted gate to avoid a persisted-store vs SSR hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, [checkExpiry]);

  if (!mounted) {
    return <Loading />;
  }

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <Clock className="size-10 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              หมดระยะเวลาการจองแล้ว
            </h2>
            <p className="text-muted-foreground">
              เวลาในการชำระเงินมัดจำหมดลงแล้ว โปรดทำรายการใหม่อีกครั้ง
            </p>
          </div>
          <Button size="lg" className="min-w-[200px]" onClick={reset}>
            จองคิวใหม่
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {step === steps[0].id && (
        <Event
          onBack={() => goToStep(steps[0].id)}
          onSelect={(event) => selectEvent(event)}
        />
      )}
      {step === steps[1].id && selectedEvent && (
        <Condition
          eventType={selectedEvent.eventTypes}
          onBack={() => goToStep(steps[0].id)}
          onNext={() => goToStep(steps[2].id)}
        />
      )}
      {step === steps[1].id && !selectedEvent && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
          <div className="max-w-md space-y-3">
            <p className="text-2xl font-bold text-foreground">
              ยังไม่ได้เลือกงาน
            </p>
            <p className="text-muted-foreground">
              กรุณาเลือกงานที่ต้องการก่อน เพื่อแสดงเงื่อนไขตามประเภทงานนั้น ๆ
            </p>
          </div>
          <Button size="lg" onClick={() => goToStep(steps[0].id)}>
            เลือกงาน
          </Button>
        </div>
      )}
      {step === steps[2].id && selectedEvent && (
        <BookingInfo
          event={selectedEvent}
          onBack={() => goToStep(steps[1].id)}
          onNext={() => goToStep(steps[3].id)}
          savedForm={bookingForm}
          onFormChange={setBookingForm}
        />
      )}
      {step === steps[3].id && (
        <Payment
          onBack={() => goToStep(steps[2].id)}
          onSubmit={reset}
          paymentStartedAt={paymentStartedAt}
          onExpired={setExpired}
        />
      )}
    </>
  );
}
