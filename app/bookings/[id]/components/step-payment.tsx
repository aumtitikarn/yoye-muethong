"use client";

import Link from "next/link";
import {
  BadgeCheck,
  CreditCard,
  Landmark,
  LogIn,
  Ticket,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useServiceFeeInfoQuery,
  useTicketFeeInfoQuery,
} from "@/lib/queries";
import { PaymentAuthError } from "@/lib/api";
import type { BookingDetailDTO } from "@/lib/api";
import { StepIntro, baht } from "./wizard-blocks";

type ItemState = {
  icon: LucideIcon;
  title: string;
  description: string;
  amount: number | null;
  /** paid | payable | pending | none */
  state: "paid" | "payable" | "pending" | "none";
  hint?: string;
  payHref?: string;
};

function StatusPill({ state }: { state: ItemState["state"] }) {
  const map = {
    paid: { label: "ชำระแล้ว", cls: "bg-emerald-50 text-emerald-600" },
    payable: { label: "รอชำระ", cls: "bg-amber-50 text-amber-600" },
    pending: { label: "รอดำเนินการ", cls: "bg-muted text-muted-foreground" },
    none: { label: "ยังไม่มียอด", cls: "bg-muted text-muted-foreground" },
  } as const;
  const { label, cls } = map[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        cls,
      )}
    >
      {state === "paid" && <BadgeCheck className="size-3.5" />}
      {label}
    </span>
  );
}

function PaymentItem({ item }: { item: ItemState }) {
  const Icon = item.icon;
  return (
    <Card className="gap-0 p-0">
      <div className="flex items-start gap-3 p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-accent">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-foreground">{item.title}</p>
            <StatusPill state={item.state} />
          </div>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {item.description}
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-xl font-black text-accent">
              {item.amount != null ? baht(item.amount) : "—"}
            </p>
            {item.state === "payable" && item.payHref && (
              <Button
                size="sm"
                asChild
                className="h-9 gap-1.5 rounded-xl bg-gradient-to-r from-[#fe8516] to-[#fe5e2a] font-bold text-white shadow-sm hover:opacity-95"
              >
                <Link href={item.payHref}>
                  <CreditCard className="size-4" />
                  ชำระเงิน
                </Link>
              </Button>
            )}
          </div>
          {item.hint && (
            <p className="mt-1.5 text-[11px] text-amber-600">{item.hint}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function StepPayment({ detail }: { detail: BookingDetailDTO }) {
  const code = detail.bookingCode;
  const serviceFee = useServiceFeeInfoQuery(code);
  const ticketFee = useTicketFeeInfoQuery(code);

  const needsLogin =
    serviceFee.error instanceof PaymentAuthError ||
    ticketFee.error instanceof PaymentAuthError;

  if (needsLogin) {
    return (
      <div className="space-y-4">
        <StepIntro step={2} title="การชำระเงิน" />
        <Card className="space-y-4 p-6 text-center">
          <h2 className="text-lg font-semibold">กรุณาเข้าสู่ระบบด้วย LINE</h2>
          <p className="text-sm text-muted-foreground">
            เพื่อดูยอดค่าใช้จ่ายและสถานะการชำระเงินของรายการนี้
          </p>
          <Button
            className="mx-auto"
            onClick={() => {
              window.location.href = `/api/auth/line/login?returnTo=${encodeURIComponent(
                `/bookings/${code}?step=2`,
              )}`;
            }}
          >
            <LogIn className="size-4" /> เข้าสู่ระบบด้วย LINE
          </Button>
        </Card>
      </div>
    );
  }

  // ── มัดจำ (deposit) — paid up front on the Omise deposit charge ──
  const depositItem: ItemState = {
    icon: Wallet,
    title: "ค่ามัดจำ",
    description: "ชำระตอนจองคิวเพื่อยืนยันสิทธิ์",
    amount: detail.depositPaid,
    state: detail.depositPaid > 0 ? "paid" : "pending",
  };

  // ── ค่าบัตร (ticket fee / ฝากจ่าย) ──
  const t = ticketFee.data;
  const ticketItem: ItemState = {
    icon: Ticket,
    title: "ค่าบัตร",
    description: t?.ticketZone
      ? `โซน ${t.ticketZone}${t.ticketQty ? ` · ${t.ticketQty}` : ""}`
      : "ยอดค่าบัตรที่ต้องโอนให้ร้าน (กรณีฝากจ่าย)",
    amount: t ? t.amountBaht : null,
    state: !t
      ? "none"
      : t.alreadyPaid
        ? "paid"
        : t.payable
          ? "payable"
          : "pending",
    hint: t?.dueText ? `กำหนดชำระ: ${t.dueText}` : undefined,
    payHref: `/payments/ticket/${code}`,
  };

  // ── ค่ากด (service fee) ──
  const s = serviceFee.data;
  const serviceItem: ItemState = {
    icon: Landmark,
    title: "ค่ากดบัตร",
    description: s?.quantity
      ? `${s.quantity} รายการ × ${baht(s.feePerEntry)}`
      : "ค่าบริการกดบัตรของทีมงาน",
    amount: s ? s.amountBaht : null,
    state: !s
      ? "none"
      : s.alreadyPaid
        ? "paid"
        : s.payable
          ? "payable"
          : "pending",
    payHref: `/payments/${code}`,
  };

  const items = [depositItem, ticketItem, serviceItem];
  const paidTotal = items
    .filter((i) => i.state === "paid" && i.amount != null)
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const dueTotal = items
    .filter((i) => i.state === "payable" && i.amount != null)
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <StepIntro
        step={2}
        title="การชำระเงิน"
        subtitle="สรุปค่ามัดจำ ค่าบัตร และค่ากดบัตร พร้อมสถานะการชำระ"
      />

      {/* Totals summary */}
      <Card className="grid grid-cols-2 gap-3 p-5">
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4">
          <p className="text-xs font-medium text-emerald-700">ชำระแล้ว</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">
            {baht(paidTotal)}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4">
          <p className="text-xs font-medium text-amber-700">รอชำระ</p>
          <p className="mt-1 text-2xl font-black text-amber-600">
            {baht(dueTotal)}
          </p>
        </div>
      </Card>

      <div className="space-y-3">
        {items.map((item) => (
          <PaymentItem key={item.title} item={item} />
        ))}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        ยอดและสถานะทั้งหมดยืนยันจากระบบของร้าน
        หากมีข้อสงสัยเกี่ยวกับค่าใช้จ่าย กรุณาติดต่อแอดมิน
      </p>
    </div>
  );
}
