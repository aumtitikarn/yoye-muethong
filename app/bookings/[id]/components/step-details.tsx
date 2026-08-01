"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Loader2,
  MapPin,
  Pencil,
  Receipt,
  StickyNote,
  Ticket,
  TriangleAlert,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useCancelBookingEntriesMutation,
  useSaveDeepInfoMutation,
} from "@/lib/queries";
import type { BookingDetailDTO } from "@/lib/api";
import { CautionNote, InfoRow, SectionHeader, StepIntro, baht } from "./wizard-blocks";

type PaymentMethod = "STORE_PAID" | "SELF_PAID";

export function StepDetails({
  detail,
  allowEdit,
}: {
  detail: BookingDetailDTO;
  allowEdit: boolean;
}) {
  const router = useRouter();
  const saveDeepInfo = useSaveDeepInfoMutation(detail.bookingCode);

  const isFormType = detail.eventTypes === "form";

  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("STORE_PAID");
  // Answers keyed by "entryIndex:fieldId" — one set per booked name/ticket.
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [isEditingZone, setIsEditingZone] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Entry numbers the customer ticked for cancellation (not yet submitted).
  const [entriesToRemove, setEntriesToRemove] = useState<number[]>([]);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const cancelEntries = useCancelBookingEntriesMutation(detail.bookingCode);

  // Sync editable state once the real booking loads.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedZoneId(
      detail.zones.find((z) => z.name === detail.zone)?.id ?? null,
    );
    if (detail.ticketPaymentMode) setPaymentMethod(detail.ticketPaymentMode);
    setExtraValues(
      Object.fromEntries(
        detail.entries.flatMap((entry) =>
          Object.entries(entry.values)
            .filter(([, v]) => v)
            .map(([fieldId, v]) => [`${entry.entryIndex}:${fieldId}`, v]),
        ),
      ),
    );
  }, [detail]);

  const extraFields = detail.fields;
  const entries = detail.entries;
  const isPerEntry = entries.length > 1;
  const answerKey = (entryIndex: number, fieldId: number) =>
    `${entryIndex}:${fieldId}`;

  /**
   * What the customer calls this slot. For form bookings that's the name they
   * typed — without it they can't tell which รายชื่อ they are about to cancel.
   * Falls back to the zone (tickets) or a plain "not filled in yet".
   */
  const entryLabel = (entry: (typeof entries)[number]): string => {
    for (const f of extraFields) {
      const v = (entry.values[String(f.id)] ?? "").trim();
      if (v) return v;
    }
    return entry.zoneName ?? "ยังไม่ได้กรอกข้อมูล";
  };

  const toggleRemove = (entryIndex: number) =>
    setEntriesToRemove((prev) =>
      prev.includes(entryIndex)
        ? prev.filter((i) => i !== entryIndex)
        : [...prev, entryIndex],
    );

  const handleConfirmRemove = () => {
    cancelEntries.mutate([...entriesToRemove].sort((a, b) => a - b), {
      onSuccess: () => {
        toast.success(
          `ยกเลิก ${entriesToRemove.length} ${unitWord}เรียบร้อยแล้ว`,
        );
        setEntriesToRemove([]);
        setRemoveConfirmOpen(false);
        setIsEditingZone(false);
      },
      onError: (err) => {
        toast.error(
          err instanceof Error ? err.message : "ยกเลิกรายการไม่สำเร็จ",
        );
      },
    });
  };
  const selectedZone = detail.zones.find((z) => z.id === selectedZoneId);
  // Quantity is now persisted server-side (cancelling entries updates the
  // booking), so the price always reflects what is actually booked.
  const ticketsToCharge = detail.quantity;

  const baseUnitPrice =
    detail.quantity > 0 ? detail.total / detail.quantity : 0;
  const unitTotal = baseUnitPrice + (detail.serviceFee || 0);
  const updatedTotal = selectedZone
    ? (selectedZone.price + (detail.serviceFee || 0)) * ticketsToCharge
    : unitTotal * ticketsToCharge;
  const displayTotal = detail.feePerEntry
    ? detail.feePerEntry * ticketsToCharge
    : updatedTotal;

  const totalLabel = isFormType ? "ค่าฟอร์ม" : "ยอดค่าบัตรรวม";
  const unitWord = isFormType ? "รายชื่อ" : "ใบ";
  const TypeIcon = isFormType ? ClipboardList : Ticket;
  const typeLabel = isFormType ? "ฟอร์มรายชื่อ" : "บัตรคอนเสิร์ต";

  // Reducing the quantity is only offered while the booking is still in the
  // ข้อมูลเชิงลึก step — the server enforces the same window, so showing the
  // control any later would just produce a 409.
  const canReduceEntries = allowEdit && detail.canCancelEntries;

  /**
   * Pick exactly which booked slots to cancel. A bare counter can't work here:
   * the customer must see *which* name goes, or they cancel the wrong person.
   * At least one slot must remain — dropping all of them is a full cancellation,
   * which lives on the tracking page with its own confirmation.
   */
  const entryPicker = (
    <div className="space-y-3 rounded-2xl border-2 border-primary bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold text-foreground">
          เลือก{unitWord}ที่ต้องการยกเลิก
        </Label>
        <span className="text-[10px] font-medium text-amber-600">
          ⚠️ ลดได้เท่านั้น
        </span>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => {
          const checked = entriesToRemove.includes(entry.entryIndex);
          const isLast = entries.length - entriesToRemove.length <= 1 && !checked;
          return (
            <label
              key={entry.entryIndex}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border-2 bg-background p-3 transition-colors",
                checked
                  ? "border-rose-400 bg-rose-50/70"
                  : "border-border/60 hover:border-rose-200",
                isLast && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="checkbox"
                className="size-4 accent-rose-500"
                checked={checked}
                disabled={isLast || cancelEntries.isPending}
                onChange={() => toggleRemove(entry.entryIndex)}
              />
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-black text-accent">
                {entry.entryIndex}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm font-semibold",
                    checked && "text-rose-700 line-through",
                  )}
                >
                  {entryLabel(entry)}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {unitWord}ที่ {entry.entryIndex}
                  {entry.zoneName ? ` · ${entry.zoneName}` : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-primary/20 pt-3">
        <p className="text-xs text-muted-foreground">
          เหลือ{" "}
          <span className="font-bold text-foreground">
            {entries.length - entriesToRemove.length} {unitWord}
          </span>{" "}
          จาก {entries.length}
        </p>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
          disabled={entriesToRemove.length === 0 || cancelEntries.isPending}
          onClick={() => setRemoveConfirmOpen(true)}
        >
          <XCircle className="size-3.5" />
          ยกเลิก {entriesToRemove.length || ""} {unitWord}
        </Button>
      </div>
    </div>
  );

  // Every required field must be filled for every booked name, not just once.
  const extraFieldsValid = entries.every((entry) =>
    extraFields.every(
      (f) =>
        !f.isRequired ||
        (extraValues[answerKey(entry.entryIndex, f.id)] ?? "").trim().length > 0,
    ),
  );
  const canSubmit = selectedZoneId !== null && extraFieldsValid;
  const canConfirm = isFormType ? extraFieldsValid : canSubmit;

  // Locking is per entry, not per booking: a booking made before this feature
  // has answers only for entry 1, and those customers must still be able to
  // fill in the remaining names. Each entry locks once it has a saved answer.
  const savedEntries = new Set(
    entries
      .filter((entry) =>
        Object.values(entry.values).some((v) => v.trim().length > 0),
      )
      .map((entry) => entry.entryIndex),
  );
  const hasSavedDeepInfo =
    extraFields.length > 0 && savedEntries.size === entries.length;
  const isSaving = saveDeepInfo.isPending || saveDeepInfo.isSuccess;

  const handleSaveDeepInfo = () => {
    saveDeepInfo.mutate(
      {
        responses: entries.flatMap((entry) =>
          extraFields.map((f) => ({
            fieldId: f.id,
            entryIndex: entry.entryIndex,
            value: (extraValues[answerKey(entry.entryIndex, f.id)] ?? "").trim(),
          })),
        ),
        // Form events have no ticket cost, so no payment method to record.
        ticketPaymentMode: isFormType ? undefined : paymentMethod,
      },
      { onSuccess: () => router.push("/tracking") },
    );
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    // Save when there is anything new: unsaved answers, OR a payment method the
    // server does not have yet. Without the second check, a ticket event with no
    // deep-info fields would never record the customer's ฝากร้าน / จ่ายเอง choice.
    const hasUnsavedAnswers = extraFields.length > 0 && !hasSavedDeepInfo;
    const hasUnsavedPaymentMode =
      !isFormType && detail.ticketPaymentMode !== paymentMethod;
    if (hasUnsavedAnswers || hasUnsavedPaymentMode) {
      handleSaveDeepInfo();
    } else {
      router.push("/tracking");
    }
  };

  const ctaClass =
    "h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-[#fe8516] to-[#fe5e2a] text-base font-bold text-white shadow-lg shadow-accent/25 hover:opacity-95";

  return (
    <div className="space-y-4">
      <StepIntro
        step={1}
        title="รายละเอียดการจอง"
        subtitle="ตรวจสอบข้อมูลงาน โซน จำนวน และข้อมูลเพิ่มเติมของคุณ"
      />

      {/* Premium ticket stub hero */}
      <Card className="relative gap-0 overflow-hidden rounded-[28px] border-primary/20 p-0 shadow-xl">
        <div className="relative aspect-[16/9] w-full sm:aspect-[3/1]">
          <Image
            src={detail.poster}
            alt={detail.eventName}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 60vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 space-y-2 p-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-accent shadow-sm backdrop-blur">
              <TypeIcon className="size-3.5" />
              {typeLabel}
            </span>
            <h2 className="text-2xl font-black leading-tight text-white drop-shadow-lg">
              {detail.eventName}
            </h2>
          </div>
        </div>

        {/* Perforated seam */}
        <div className="relative h-6 bg-card">
          <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-background" />
          <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-background" />
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-border/70" />
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-secondary/10 p-3 sm:col-span-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent">
              <Receipt className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Booking No.
              </p>
              <p className="truncate font-mono text-sm font-bold text-foreground">
                {detail.bookingCode}
              </p>
            </div>
          </div>

          <InfoRow icon={CalendarDays} label="รอบการแสดง" value={detail.showTime} />
          <InfoRow icon={MapPin} label="โซน" value={detail.zone} />
          <InfoRow
            icon={Ticket}
            label="จำนวน"
            value={`${detail.quantity} ${unitWord}`}
          />
          {detail.note && (
            <InfoRow
              icon={StickyNote}
              label="หมายเหตุ"
              value={
                <span className="text-xs font-normal text-muted-foreground">
                  {detail.note}
                </span>
              }
            />
          )}
        </div>
      </Card>

      {/* Zone / quantity selection */}
      <Card className="space-y-4 p-5">
        {isFormType ? (
          <>
            <SectionHeader
              icon={Users}
              title="จำนวนรายชื่อ"
              action={
                canReduceEntries ? (
                  <Button
                    variant={isEditingZone ? "default" : "outline"}
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={() => setIsEditingZone((v) => !v)}
                  >
                    {isEditingZone ? (
                      <>
                        <BadgeCheck className="size-3.5" />
                        เสร็จสิ้น
                      </>
                    ) : (
                      <>
                        <Pencil className="size-3.5" />
                        เปลี่ยนจำนวน
                      </>
                    )}
                  </Button>
                ) : undefined
              }
            />

            {canReduceEntries && isEditingZone ? (
              entryPicker
            ) : (
              <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-secondary/20 p-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-accent">
                  <Users className="size-6" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    จำนวนที่เลือก
                  </p>
                  <p className="text-2xl font-black text-accent">
                    {ticketsToCharge}
                    <span className="ml-1 text-sm font-semibold text-muted-foreground">
                      รายชื่อ
                    </span>
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <SectionHeader
              icon={MapPin}
              title="โซน / ราคาบัตร"
              action={
                allowEdit ? (
                  <Button
                    variant={isEditingZone ? "default" : "outline"}
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={() => setIsEditingZone((v) => !v)}
                  >
                    {isEditingZone ? (
                      <>
                        <BadgeCheck className="size-3.5" />
                        เสร็จสิ้น
                      </>
                    ) : (
                      <>
                        <Pencil className="size-3.5" />
                        เปลี่ยนโซน
                      </>
                    )}
                  </Button>
                ) : undefined
              }
            />

            {allowEdit && (
              <CautionNote>
                กรณีลดจำนวนบัตรภายหลัง
                ทางร้านขอสงวนสิทธิ์ไม่คืนเงินมัดจำในส่วนที่ลดลง
              </CautionNote>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(isEditingZone
                ? detail.zones
                : detail.zones.filter((z) => z.id === selectedZoneId)
              ).map((zone) => {
                const isSelected = selectedZoneId === zone.id;
                return (
                  <div
                    key={zone.id}
                    className={cn(
                      "relative rounded-2xl border-2 p-4 transition-all duration-200",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-md"
                        : zone.available
                          ? "border-border/60 hover:border-primary/40"
                          : "border-border/30 opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      disabled={!zone.available || !isEditingZone}
                      onClick={() => setSelectedZoneId(zone.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {zone.name}
                        </span>
                        {isSelected ? (
                          <BadgeCheck className="size-4 text-accent" />
                        ) : (
                          !zone.available && (
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                              เต็ม
                            </span>
                          )
                        )}
                      </div>
                      <p className="mt-1 text-lg font-black text-accent">
                        {baht(zone.price)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          + ค่ากดบัตร {detail.serviceFee.toLocaleString()}/ใบ
                        </span>
                      </p>
                    </button>
                  </div>
                );
              })}
            </div>

            {canReduceEntries && isEditingZone && entryPicker}
          </>
        )}
      </Card>

      {/* Payment method — hidden for form-type events, edit flow only */}
      {!isFormType && allowEdit && (
        <Card className="space-y-4 p-5">
          <SectionHeader icon={CreditCard} title="วิธีการชำระ" />
          <RadioGroup
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <label
              htmlFor="STORE_PAID"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200",
                paymentMethod === "STORE_PAID"
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border/60 hover:border-primary/40",
              )}
            >
              <RadioGroupItem value="STORE_PAID" id="STORE_PAID" />
              <div>
                <p className="text-sm font-semibold">ฝากร้านจ่าย</p>
                <p className="text-xs text-muted-foreground">
                  โอนค่าบัตรให้ร้าน ก่อนวันกด 1 วัน
                </p>
              </div>
            </label>
            <label
              htmlFor="SELF_PAID"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200",
                paymentMethod === "SELF_PAID"
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border/60 hover:border-primary/40",
              )}
            >
              <RadioGroupItem value="SELF_PAID" id="SELF_PAID" />
              <div>
                <p className="text-sm font-semibold">จ่ายเอง</p>
                <p className="text-xs text-muted-foreground">
                  ลูกค้าชำระค่าบัตรด้วยตนเอง
                </p>
              </div>
            </label>
          </RadioGroup>

          {/* Tell the customer what actually happens next. Choosing ฝากร้าน used
              to be a dead end — the amount is set by an admin afterwards, so
              there is nothing to pay yet at this point. */}
          {paymentMethod === "STORE_PAID" ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <p className="font-semibold text-foreground">
                ขั้นตอนถัดไป — ฝากร้านจ่าย
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                หลังยืนยันข้อมูล ทางร้านจะสรุปยอดค่าบัตรแล้วแจ้งให้ทาง LINE
                เมื่อได้รับยอดแล้ว สถานะจะเปลี่ยนเป็น{" "}
                <span className="font-semibold text-foreground">
                  &ldquo;รอชำระค่าบัตร&rdquo;
                </span>{" "}
                และปุ่มชำระเงินจะขึ้นในหน้าติดตามสถานะค่ะ
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-secondary/20 p-4 text-sm">
              <p className="font-semibold text-foreground">
                ขั้นตอนถัดไป — จ่ายเอง
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                ลูกค้าชำระค่าบัตรกับทางผู้จัดเอง
                ทางร้านจะเรียกเก็บเฉพาะค่ากดบัตรตอนสรุปยอดค่ะ
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Extra fields (deep info) */}
      <Card className="space-y-4 p-5">
        <SectionHeader
          icon={User}
          title="ข้อมูลเพิ่มเติม"
          hint={
            extraFields.length > 0
              ? isPerEntry
                ? `กรอกให้ครบทั้ง ${entries.length} ${unitWord} เพื่อยืนยันการจอง`
                : "กรอกข้อมูลให้ครบเพื่อยืนยันการจอง"
              : undefined
          }
          action={
            hasSavedDeepInfo ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-600">
                <BadgeCheck className="size-3.5" />
                บันทึกแล้ว
              </span>
            ) : undefined
          }
        />

        {extraFields.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/10 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              งานนี้ไม่มีข้อมูลเพิ่มเติมที่ต้องกรอก
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const body = (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {extraFields.map((field) => {
                    const key = answerKey(entry.entryIndex, field.id);
                    return (
                      <div key={field.id} className="space-y-1.5">
                        <Label
                          htmlFor={`extra-${key}`}
                          className="text-sm font-medium"
                        >
                          {field.label}
                          {field.isRequired && (
                            <span className="ml-1 text-destructive">*</span>
                          )}
                        </Label>
                        <Input
                          id={`extra-${key}`}
                          placeholder={field.label}
                          value={extraValues[key] ?? ""}
                          disabled={
                            savedEntries.has(entry.entryIndex) || !allowEdit
                          }
                          className="h-11 rounded-xl text-foreground disabled:opacity-100 disabled:text-foreground"
                          onChange={(e) => {
                            if (saveDeepInfo.isSuccess) saveDeepInfo.reset();
                            setExtraValues((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              );

              // A single booked entry needs no per-entry heading — keep the old
              // flat layout so nothing changes for 1-name bookings.
              if (!isPerEntry) return <div key={entry.entryIndex}>{body}</div>;

              return (
                <div
                  key={entry.entryIndex}
                  className="space-y-3 rounded-2xl border border-border/60 bg-secondary/10 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-black text-accent">
                      {entry.entryIndex}
                    </span>
                    <p className="text-sm font-bold text-foreground">
                      {unitWord}ที่ {entry.entryIndex}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      จาก {entries.length} {unitWord}
                    </span>
                    {savedEntries.has(entry.entryIndex) && (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                        <BadgeCheck className="size-3" />
                        บันทึกแล้ว
                      </span>
                    )}
                  </div>
                  {body}
                </div>
              );
            })}
          </div>
        )}

        {allowEdit &&
          extraFields.length > 0 &&
          !hasSavedDeepInfo &&
          !extraFieldsValid && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              กรุณากรอกช่องที่มีเครื่องหมาย{" "}
              <span className="text-destructive">*</span> ให้ครบ
            </p>
          )}
      </Card>

      {/* Price summary & confirm CTA — only in edit mode */}
      {allowEdit && (
        <Card className="space-y-4 p-5">
          {!isFormType && paymentMethod === "STORE_PAID" && (
            <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {totalLabel}
                  </div>
                  <div className="text-3xl font-black text-accent">
                    {baht(displayTotal)}
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <div className="text-xs font-medium text-foreground">
                    {selectedZone?.name ?? detail.zone}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {detail.feePerEntry ? (
                      <>
                        {ticketsToCharge} × {baht(detail.feePerEntry)}
                      </>
                    ) : (
                      <>
                        {ticketsToCharge} ใบ × ({baht(selectedZone?.price ?? 0)} +{" "}
                        {detail.serviceFee.toLocaleString()})
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-primary/20 pt-2">
                <p className="text-[11px] font-medium leading-relaxed text-amber-600">
                  ⚠️ ราคานี้ยังไม่รวมภาษีมูลค่าเพิ่ม 7%
                </p>
              </div>
            </div>
          )}

          <Button
            className={ctaClass}
            disabled={!canConfirm || isSaving}
            onClick={() => setConfirmOpen(true)}
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                ยืนยันข้อมูล
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
          {!canConfirm && (
            <p className="text-center text-xs text-muted-foreground">
              {isFormType
                ? "กรุณากรอกข้อมูลให้ครบก่อนยืนยัน"
                : "กรุณาเลือกโซนและกรอกข้อมูลให้ครบก่อนยืนยัน"}
            </p>
          )}
          {saveDeepInfo.isError && (
            <p className="text-center text-sm text-destructive">
              {saveDeepInfo.error instanceof Error
                ? saveDeepInfo.error.message
                : "บันทึกข้อมูลไม่สำเร็จ"}
            </p>
          )}
        </Card>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ยืนยันข้อมูลการจอง</DialogTitle>
            <DialogDescription>
              กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนยืนยัน หลังจากยืนยันแล้วจะไม่สามารถแก้ไขได้
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/10 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">งาน</span>
              <span className="text-right font-semibold">{detail.eventName}</span>
            </div>
            {!isFormType && (
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">โซน</span>
                <span className="text-right font-semibold">
                  {selectedZone?.name ?? detail.zone}
                </span>
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">จำนวน</span>
              <span className="text-right font-semibold">
                {ticketsToCharge} {unitWord}
              </span>
            </div>
            {extraFields.length > 0 && (
              <div className="max-h-64 space-y-3 overflow-y-auto border-t border-border/60 pt-2">
                <p className="font-semibold">ข้อมูลเพิ่มเติม</p>
                {entries.map((entry) => (
                  <div key={entry.entryIndex} className="space-y-1">
                    {isPerEntry && (
                      <p className="text-xs font-bold text-accent">
                        {unitWord}ที่ {entry.entryIndex}
                      </p>
                    )}
                    {extraFields.map((field) => {
                      const value = (
                        extraValues[answerKey(entry.entryIndex, field.id)] ?? ""
                      ).trim();
                      return (
                        <div
                          key={field.id}
                          className="flex items-start justify-between gap-3"
                        >
                          <span className="text-muted-foreground">
                            {field.label}
                          </span>
                          <span className="min-w-0 break-words text-right font-semibold">
                            {value || "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button className="flex-1" onClick={handleConfirm}>
              ยืนยัน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm cancelling specific booked names/tickets (deposit forfeited) */}
      <Dialog
        open={removeConfirmOpen}
        onOpenChange={(open) => {
          if (!cancelEntries.isPending) setRemoveConfirmOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-1 flex size-12 items-center justify-center rounded-full bg-rose-100">
              <TriangleAlert className="size-6 text-rose-600" />
            </div>
            <DialogTitle className="text-center">
              ยืนยันการยกเลิก {entriesToRemove.length} {unitWord}
            </DialogTitle>
            <DialogDescription className="text-center">
              รายการที่จะถูกยกเลิกออกจากการจองนี้
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border/60 bg-secondary/10 p-3">
            {entries
              .filter((e) => entriesToRemove.includes(e.entryIndex))
              .map((entry) => (
                <div
                  key={entry.entryIndex}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[11px] font-bold text-rose-700">
                    {entry.entryIndex}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {entryLabel(entry)}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {unitWord}ที่ {entry.entryIndex}
                  </span>
                </div>
              ))}
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-center text-sm text-rose-700">
            เมื่อยกเลิกแล้ว{" "}
            <span className="font-bold">
              จะไม่มีการคืนมัดจำในส่วนที่ลดลงทุกกรณี
            </span>
            <br />
            คุณยังยืนยันการทำรายการหรือไม่
          </div>

          <DialogFooter className="sm:justify-center">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={cancelEntries.isPending}
              onClick={() => setRemoveConfirmOpen(false)}
            >
              ไม่ใช่ตอนนี้
            </Button>
            <Button
              className="w-full gap-1.5 bg-rose-600 text-white hover:bg-rose-700 sm:w-auto"
              disabled={cancelEntries.isPending}
              onClick={handleConfirmRemove}
            >
              {cancelEntries.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              ยืนยันยกเลิก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
