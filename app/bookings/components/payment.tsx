"use client";

import { useEffect, useState } from "react";
import StepBooking from "./stepBooking";
import { BackStep } from "./backStep";
import type { BookingEvent } from "./event";
import OmisePayment from "./OmisePayment";
import { Card } from "@/components/ui/card";
import { EEventTypes, EZoneStatus } from "../types/enum";
import { Clock, ShieldCheck } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useRouter } from "next/navigation";
import { useBookingStore } from "../store";

const DEPOSIT_PER_ENTRY = 100; // ฿ per name/ticket — mirrors the server

interface PaymentProps {
  readonly booking?: {
    event: BookingEvent;
    bookingCode: string;
    showTime: string;
    zone: string;
    quantity: number;
    total: number;
    serviceFee: number;
    note?: string;
  };
  readonly onBack: () => void;
  readonly onSubmit?: () => void;
  readonly paymentStartedAt?: number | null;
  readonly onExpired?: () => void;
}

const mockBookingDetails: NonNullable<PaymentProps["booking"]> = {
  event: {
    id: 1,
    name: "BLACKPINK WORLD TOUR [BORN PINK] IN BANGKOK",
    poster: "/con.jpeg",
    eventTypes: EEventTypes.ticket,
    showTime: "7-8 มกราคม 2026 (2 รอบ)",
    ticketInfo:
      "VIP Standing 8,500 / Standing 5,500 / Seat A 6,500 / Seat B 4,500",
    note: "ลำดับคิวตามเวลาชำระมัดจำ - สลับโซนได้ถ้ายินยอม",
    statusEvent: EZoneStatus.AVAILABLE,
    servicePriceForm: 500,
  },
  bookingCode: "YJI-BP-2026-001",
  showTime: "25 เมษายน 2569 (19:00 น.)",
  zone: "VIP Standing",
  quantity: 2,
  total: 17000,
  serviceFee: 500,
  note: "หมายเหตุตอนที่กรอกรายละเอียดการจอง",
};

const COUNTDOWN_SECONDS = 10 * 60;

export default function Payment({
  booking = mockBookingDetails,
  onBack,
  onSubmit,
  paymentStartedAt,
  onExpired,
}: PaymentProps) {
  const router = useRouter();
  const selectedEvent = useBookingStore((s) => s.selectedEvent);
  const bookingForm = useBookingStore((s) => s.bookingForm);

  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    if (!paymentStartedAt) return COUNTDOWN_SECONDS;
    const elapsed = Math.floor((Date.now() - paymentStartedAt) / 1000);
    return Math.max(0, COUNTDOWN_SECONDS - elapsed);
  });

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          globalThis.clearInterval(timer);
          onExpired?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, [onExpired]);

  const timerMinutes = String(Math.floor(remainingSeconds / 60)).padStart(
    2,
    "0",
  );
  const timerSeconds = String(remainingSeconds % 60).padStart(2, "0");

  // Real booking summary from the store (falls back to mock if navigated to
  // directly). The server recomputes the deposit authoritatively at charge time.
  const isForm = selectedEvent
    ? selectedEvent.eventTypes === EEventTypes.form
    : booking.event.eventTypes === EEventTypes.form;
  const eventName = selectedEvent?.name ?? booking.event.name;
  const showTime = selectedEvent?.showTime ?? booking.showTime;
  const quantity = bookingForm?.ticketCount ?? booking.quantity;
  const unitLabel = isForm ? "รายชื่อ" : "ใบ";
  const depositAmount = quantity * DEPOSIT_PER_ENTRY;

  return (
    <div className="min-h-screen py-4 px-4">
      <Toaster position="top-center" richColors />
      <div className="max-w-5xl mx-auto space-y-4">
        <StepBooking currentStep={4} />
        <BackStep onBack={onBack} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <Card className="p-4 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                รายละเอียดการจอง
              </p>
              <h2 className="text-xl font-bold text-foreground">{eventName}</h2>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {isForm ? "วันที่กรอกฟอร์ม" : "รอบการแสดง"}
                </span>
                <span className="font-semibold">{showTime}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {isForm ? "จำนวนรายชื่อ" : "จำนวนบัตร"}
                </span>
                <span className="font-semibold">
                  {quantity} {unitLabel}
                </span>
              </div>
              <div className="border-t pt-3 flex items-center justify-between">
                <span className="text-muted-foreground">ยอดมัดจำที่ต้องชำระ</span>
                <span className="text-2xl font-black text-primary">
                  ฿{depositAmount.toLocaleString()}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                มัดจำ {DEPOSIT_PER_ENTRY} บาท/{unitLabel} × {quantity}
              </p>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <ShieldCheck className="size-4" /> หมายเหตุสำคัญ
              </div>
              <p className="mt-1 text-muted-foreground">
                {booking.note ??
                  "โปรดชำระด้วยชื่อ/บัญชีที่ตรงกับผู้จองเท่านั้น หากพบความผิดปกติร้านขอสงวนสิทธิ์ยกเลิกงานทันที."}
              </p>
            </div>
          </Card>

          <Card className="p-4 lg:col-span-2 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                การชำระเงิน
              </p>
              <h3 className="text-xl font-bold">ชำระเงินมัดจำ</h3>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-amber-900">
                  <Clock className="size-5" /> เวลาที่เหลือในการชำระ
                </div>
                <span className="text-2xl font-black tracking-widest text-amber-900">
                  {timerMinutes}:{timerSeconds}
                </span>
              </div>
              <p className="text-sm text-amber-800/80">
                กรุณาชำระเงินภายใน 10 นาที หากหมดเวลาต้องเริ่มขั้นตอนใหม่
              </p>
            </div>

            <OmisePayment
              onSuccess={() => {
                onSubmit?.();
                router.push("/tracking");
              }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
