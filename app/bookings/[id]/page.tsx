"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useBookingDetailQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import Loading from "@/components/Loading";
import {
  ArrowLeft,
  ClipboardList,
  CreditCard,
  Ticket,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { WizardNav, type WizardStep } from "./components/wizard-nav";
import { StepDetails } from "./components/step-details";
import { StepPayment } from "./components/step-payment";
import { StepRefund } from "./components/step-refund";

function BookingDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const bookingId = params.id as string;

  // Quantity/deep-info editing is only offered when the customer arrived via the
  // "กรอกข้อมูลเพิ่มเติม" action (which appends ?edit=1).
  const allowEdit = searchParams.get("edit") === "1";
  const initialStep = Number(searchParams.get("step")) || 1;

  const [active, setActive] = useState(
    initialStep >= 1 && initialStep <= 3 ? initialStep : 1,
  );

  const { data: detail, isPending, isError, error } =
    useBookingDetailQuery(bookingId);

  if (isPending) return <Loading />;

  if (isError || !detail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-8" />
        </div>
        <p className="text-lg font-semibold text-foreground">
          {error?.message ?? "ไม่พบข้อมูลการจอง"}
        </p>
        <Button asChild variant="outline">
          <Link href="/tracking">กลับหน้าติดตามสถานะ</Link>
        </Button>
      </div>
    );
  }

  const isFormType = detail.eventTypes === "form";
  const TypeIcon = isFormType ? ClipboardList : Ticket;
  const typeLabel = isFormType ? "ฟอร์มรายชื่อ" : "บัตรคอนเสิร์ต";

  // Done only when every booked name has an answer for every field — a booking
  // for 3 รายชื่อ isn't finished after filling in just the first one.
  const detailsDone =
    detail.fields.length === 0 ||
    detail.entries.every((entry) =>
      detail.fields.every((f) => (entry.values[String(f.id)] ?? "").trim()),
    );

  const steps: WizardStep[] = [
    {
      id: 1,
      label: "รายละเอียดการจอง",
      hint: "ข้อมูลงาน โซน จำนวน",
      icon: ClipboardList,
      done: detailsDone,
    },
    {
      id: 2,
      label: "การชำระเงิน",
      hint: "มัดจำ · ค่าบัตร · ค่ากด",
      icon: CreditCard,
    },
    {
      id: 3,
      label: "การคืนเงิน",
      hint: "บัญชี & ประวัติคืนเงิน",
      icon: Wallet,
    },
  ];

  return (
    <div className="relative min-h-screen pb-10">
      {/* Decorative warm backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/20 via-primary/5 to-transparent"
      />

      {/* Sticky header — sits just below the global navbar */}
      <header className="sticky top-[74px] z-30 border-b border-border/50 bg-background/70 backdrop-blur-md md:top-[92px]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="shrink-0 rounded-full text-foreground hover:bg-primary/10"
          >
            <Link href="/bookings" aria-label="กลับหน้าจอง">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight">
              รายละเอียดการจอง
            </h1>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {detail.bookingCode}
            </p>
          </div>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-accent to-[#fe5e2a] px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
            <TypeIcon className="size-3.5" />
            {typeLabel}
          </span>
        </div>
      </header>

      <div className="relative mx-auto max-w-5xl px-3 py-5 sm:px-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ── Left: wizard rail ── */}
          <div className="lg:col-span-4">
            <WizardNav
              steps={steps}
              active={active}
              onSelect={setActive}
              eventName={detail.eventName}
              bookingCode={detail.bookingCode}
              poster={detail.poster}
              typeLabel={typeLabel}
              typeIcon={TypeIcon}
            />
          </div>

          {/* ── Right: active step content ── */}
          <main className="lg:col-span-8">
            {active === 1 && (
              <StepDetails detail={detail} allowEdit={allowEdit} />
            )}
            {active === 2 && <StepPayment detail={detail} />}
            {active === 3 && <StepRefund bookingCode={detail.bookingCode} />}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function BookingDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <BookingDetailContent />
    </Suspense>
  );
}
