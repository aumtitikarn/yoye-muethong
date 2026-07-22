"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useBookingDetailQuery, useSaveDeepInfoMutation } from "@/lib/queries";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Loading from "@/components/Loading";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Loader2,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Receipt,
  StickyNote,
  Ticket,
  TriangleAlert,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EEventTypes } from "../types/enum";

// ── Types ──────────────────────────────────────────────

type ZoneOption = {
  id: number;
  name: string;
  price: number;
  available: boolean;
};

type BookingDetail = {
  bookingCode: string;
  eventName: string;
  poster: string;
  showTime: string;
  zone: string;
  eventTypes: EEventTypes;
  quantity: number;
  total: number;
  serviceFee: number;
  feePerEntry: number;
  note?: string;
  zones: ZoneOption[];
};

type PaymentMethod = "store_pay" | "self_pay";

// ── Small building blocks ──────────────────────────────

/** Icon + label + value row used in the poster summary card. */
function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "text-sm font-semibold break-words text-foreground",
            mono && "font-mono",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/** Section heading with a gradient icon chip and an optional action slot. */
function SectionHeader({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 text-accent">
          <Icon className="size-5" />
        </div>
        <div className="space-y-0.5">
          <h3 className="text-base font-bold leading-tight">{title}</h3>
          {hint && (
            <p className="max-w-[240px] text-xs leading-snug text-muted-foreground sm:max-w-none">
              {hint}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Amber policy / caution note. */
function CautionNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-amber-200/70 bg-amber-50 p-2.5 text-[11px] leading-snug text-amber-700">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────

function BookingDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = params.id as string;

  // Quantity editing is only offered when the customer arrived via the
  // "กรอกข้อมูลเพิ่มเติม" action (which appends ?edit=1). Plain detail views
  // (three-dots menu / row click) stay read-only.
  const allowEdit = searchParams.get("edit") === "1";

  const { data: detail, isPending, isError, error } =
    useBookingDetailQuery(bookingId);

  const saveDeepInfo = useSaveDeepInfoMutation(bookingId);

  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("store_pay");
  const [adjustedQuantity, setAdjustedQuantity] = useState(1);
  const [extraValues, setExtraValues] = useState<Record<number, string>>({});
  const [isEditingZone, setIsEditingZone] = useState(false);

  // Sync editable state once the real booking loads.
  useEffect(() => {
    if (!detail) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedZoneId(
      detail.zones.find((z) => z.name === detail.zone)?.id ?? null,
    );
    setAdjustedQuantity(Math.max(1, detail.quantity));
    // Seed the extra fields with any answers the customer saved earlier.
    setExtraValues(
      Object.fromEntries(
        detail.fields
          .filter((f) => f.value)
          .map((f) => [f.id, f.value]),
      ),
    );
  }, [detail]);

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

  const booking: BookingDetail = {
    ...detail,
    eventTypes:
      detail.eventTypes === "form" ? EEventTypes.form : EEventTypes.ticket,
  };
  const extraFields = detail.fields;

  const selectedZone = booking.zones.find((z) => z.id === selectedZoneId);
  const ticketsToCharge = Math.min(adjustedQuantity, booking.quantity);

  // Calculate unit price for fallback (e.g. form type without zones)
  const baseUnitPrice =
    booking.quantity > 0 ? booking.total / booking.quantity : 0;
  const unitTotal = baseUnitPrice + (booking.serviceFee || 0);

  const updatedTotal = selectedZone
    ? (selectedZone.price + (booking.serviceFee || 0)) * ticketsToCharge
    : unitTotal * ticketsToCharge;

  // Form total uses the event fee per entry × จำนวนรายชื่อ; tickets use the zone total.
  const displayTotal = booking.feePerEntry
    ? booking.feePerEntry * ticketsToCharge
    : updatedTotal;

  const isFormType = booking.eventTypes === EEventTypes.form;
  const totalLabel = isFormType ? "ค่าฟอร์ม" : "ยอดค่าบัตรรวม";
  const unitWord = isFormType ? "รายชื่อ" : "ใบ";

  const TypeIcon = isFormType ? ClipboardList : Ticket;
  const typeLabel = isFormType ? "ฟอร์มรายชื่อ" : "บัตรคอนเสิร์ต";

  const extraFieldsValid = extraFields.every(
    (f) => !f.isRequired || (extraValues[f.id] ?? "").trim().length > 0,
  );
  const canSubmit = selectedZoneId !== null && extraFieldsValid;

  // The customer has already submitted their extra info if the loaded booking
  // carries any saved answer — in that case we hide the fill-in button.
  const hasSavedDeepInfo = extraFields.some((f) => f.value.trim().length > 0);
  const isSaving = saveDeepInfo.isPending || saveDeepInfo.isSuccess;

  const handleSaveDeepInfo = () => {
    saveDeepInfo.mutate(
      extraFields.map((f) => ({
        fieldId: f.id,
        value: (extraValues[f.id] ?? "").trim(),
      })),
      { onSuccess: () => router.push("/tracking") },
    );
  };

  // Premium gradient CTA — higher contrast than the pastel primary fill.
  const ctaClass =
    "h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-[#fe8516] to-[#fe5e2a] text-base font-bold text-white shadow-lg shadow-accent/25 hover:opacity-95";

  return (
    <div className="relative min-h-screen pb-10">
      {/* Decorative warm backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/20 via-primary/5 to-transparent"
      />

      {/* Sticky header — sits just below the global navbar (≈74px mobile / ≈92px desktop) */}
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
              {booking.bookingCode}
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
          {/* ── Left: Premium ticket stub ── */}
          <aside className="lg:col-span-5">
            <div className="space-y-4 lg:sticky lg:top-[156px]">
              <Card className="relative gap-0 overflow-hidden rounded-[28px] border-primary/20 p-0 shadow-xl">
                {/* Poster */}
                <div className="relative aspect-[3/4] w-full">
                  <Image
                    src={booking.poster}
                    alt={booking.eventName}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 45vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 space-y-2 p-5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-accent shadow-sm backdrop-blur">
                      <TypeIcon className="size-3.5" />
                      {typeLabel}
                    </span>
                    <h2 className="text-2xl font-black leading-tight text-white drop-shadow-lg">
                      {booking.eventName}
                    </h2>
                  </div>
                </div>

                {/* Perforated seam */}
                <div className="relative h-6 bg-card">
                  <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-background" />
                  <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-background" />
                  <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-border/70" />
                </div>

                {/* Stub details */}
                <div className="space-y-3 px-5 pb-5">
                  {/* Booking number */}
                  <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-secondary/10 p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent">
                      <Receipt className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Booking No.
                      </p>
                      <p className="truncate font-mono text-sm font-bold text-foreground">
                        {booking.bookingCode}
                      </p>
                    </div>
                  </div>

                  <InfoRow
                    icon={CalendarDays}
                    label="รอบการแสดง"
                    value={booking.showTime}
                  />
                  <InfoRow icon={MapPin} label="โซน" value={booking.zone} />
                  <InfoRow
                    icon={Ticket}
                    label="จำนวน"
                    value={`${booking.quantity} ${unitWord}`}
                  />
                  {booking.note && (
                    <InfoRow
                      icon={StickyNote}
                      label="หมายเหตุ"
                      value={
                        <span className="text-xs font-normal text-muted-foreground">
                          {booking.note}
                        </span>
                      }
                    />
                  )}
                </div>
              </Card>
            </div>
          </aside>

          {/* ── Right: Editable form ── */}
          <main className="space-y-4 lg:col-span-7">
            {/* Zone / quantity selection */}
            <Card className="space-y-4 p-5">
              {isFormType ? (
                /* ── Form Type: Quantity Selection ── */
                <>
                  <SectionHeader
                    icon={Users}
                    title="จำนวนรายชื่อ"
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
                              เปลี่ยนจำนวน
                            </>
                          )}
                        </Button>
                      ) : undefined
                    }
                  />

                  {allowEdit && isEditingZone ? (
                    <div className="space-y-4 rounded-2xl border-2 border-primary bg-primary/5 p-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold text-foreground">
                          ปรับจำนวนรายชื่อ
                        </Label>
                        <span className="text-[10px] font-medium text-amber-600">
                          ⚠️ ลดได้เท่านั้น
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="inline-flex items-center rounded-2xl border border-border/70 bg-background px-2 py-1.5 shadow-sm">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-lg hover:bg-muted"
                            onClick={() =>
                              setAdjustedQuantity((prev) => Math.max(1, prev - 1))
                            }
                            disabled={adjustedQuantity === 1}
                          >
                            <Minus className="size-4" />
                          </Button>
                          <div className="min-w-[60px] text-center">
                            <p className="text-2xl font-black leading-none text-accent">
                              {adjustedQuantity}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-lg hover:bg-muted"
                            onClick={() =>
                              setAdjustedQuantity((prev) =>
                                Math.min(booking.quantity, prev + 1),
                              )
                            }
                            disabled={adjustedQuantity === booking.quantity}
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <p>จากจำนวนเดิม</p>
                          <div className="flex items-center gap-1 font-semibold text-foreground">
                            <Users className="size-3" />
                            {booking.quantity} รายชื่อ
                          </div>
                        </div>
                      </div>
                    </div>
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
                /* ── Ticket Type: Zone Selection ── */
                <>
                  <SectionHeader
                    icon={MapPin}
                    title="โซน / ราคาบัตร"
                    action={
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
                    }
                  />

                  <CautionNote>
                    กรณีลดจำนวนบัตรภายหลัง
                    ทางร้านขอสงวนสิทธิ์ไม่คืนเงินมัดจำในส่วนที่ลดลง
                  </CautionNote>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(isEditingZone
                      ? booking.zones
                      : booking.zones.filter((z) => z.id === selectedZoneId)
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
                              ฿{zone.price.toLocaleString()}
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                + ค่ากดบัตร {booking.serviceFee.toLocaleString()}
                                /ใบ
                              </span>
                            </p>
                          </button>
                          {isSelected && isEditingZone && (
                            <div className="mt-3 space-y-2 border-t border-primary/20 pt-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold text-muted-foreground">
                                  ปรับจำนวนบัตร
                                </Label>
                                <span className="text-[10px] font-medium text-amber-600">
                                  ⚠️ ลดได้เท่านั้น
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="inline-flex items-center rounded-xl border border-border/70 bg-background px-1.5 py-1 shadow-sm">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAdjustedQuantity((prev) =>
                                        Math.max(1, prev - 1),
                                      );
                                    }}
                                    disabled={adjustedQuantity === 1}
                                  >
                                    <Minus className="size-3.5" />
                                  </Button>
                                  <div className="min-w-[48px] text-center">
                                    <p className="text-xl font-black leading-none">
                                      {adjustedQuantity}
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAdjustedQuantity((prev) =>
                                        Math.min(booking.quantity, prev + 1),
                                      );
                                    }}
                                    disabled={
                                      adjustedQuantity === booking.quantity
                                    }
                                  >
                                    <Plus className="size-3.5" />
                                  </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  จำนวนเดิม {booking.quantity} ใบ
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>

            {/* Payment method — hidden for form-type events */}
            {!isFormType && (
              <Card className="space-y-4 p-5">
                <SectionHeader icon={CreditCard} title="วิธีการชำระ" />
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  <label
                    htmlFor="store_pay"
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200",
                      paymentMethod === "store_pay"
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border/60 hover:border-primary/40",
                    )}
                  >
                    <RadioGroupItem value="store_pay" id="store_pay" />
                    <div>
                      <p className="text-sm font-semibold">ฝากร้านจ่าย</p>
                      <p className="text-xs text-muted-foreground">
                        โอนค่าบัตรให้ร้าน ก่อนวันกด 1 วัน
                      </p>
                    </div>
                  </label>
                  <label
                    htmlFor="self_pay"
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200",
                      paymentMethod === "self_pay"
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border/60 hover:border-primary/40",
                    )}
                  >
                    <RadioGroupItem value="self_pay" id="self_pay" />
                    <div>
                      <p className="text-sm font-semibold">จ่ายเอง</p>
                      <p className="text-xs text-muted-foreground">
                        ลูกค้าชำระค่าบัตรด้วยตนเอง
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </Card>
            )}

            {/* Extra fields (deep info) */}
            <Card className="space-y-4 p-5">
              <SectionHeader
                icon={User}
                title="ข้อมูลเพิ่มเติม"
                hint={
                  extraFields.length > 0
                    ? "กรอกข้อมูลให้ครบเพื่อยืนยันการจอง"
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {extraFields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label
                        htmlFor={`extra-${field.id}`}
                        className="text-sm font-medium"
                      >
                        {field.label}
                        {field.isRequired && (
                          <span className="ml-1 text-destructive">*</span>
                        )}
                      </Label>
                      <Input
                        id={`extra-${field.id}`}
                        placeholder={field.label}
                        value={extraValues[field.id] ?? ""}
                        disabled={hasSavedDeepInfo}
                        className="h-11 rounded-xl"
                        onChange={(e) => {
                          if (saveDeepInfo.isSuccess) saveDeepInfo.reset();
                          setExtraValues((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {extraFields.length > 0 && !hasSavedDeepInfo && (
                <div className="space-y-2 pt-1">
                  <Button
                    className={ctaClass}
                    onClick={handleSaveDeepInfo}
                    disabled={!extraFieldsValid || isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        กำลังบันทึก...
                      </>
                    ) : (
                      <>
                        บันทึกข้อมูล
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                  {!extraFieldsValid && (
                    <p className="text-center text-xs text-muted-foreground">
                      กรุณากรอกช่องที่มีเครื่องหมาย{" "}
                      <span className="text-destructive">*</span> ให้ครบ
                    </p>
                  )}
                  {saveDeepInfo.isError && (
                    <p className="text-center text-sm text-destructive">
                      {saveDeepInfo.error instanceof Error
                        ? saveDeepInfo.error.message
                        : "บันทึกข้อมูลไม่สำเร็จ"}
                    </p>
                  )}
                </div>
              )}
            </Card>

            {/* Price summary & submit — hidden for form-type events */}
            {!isFormType && (
              <Card className="space-y-4 p-5">
                {paymentMethod === "store_pay" && (
                  <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {totalLabel}
                        </div>
                        <div className="text-3xl font-black text-accent">
                          ฿{displayTotal.toLocaleString()}
                        </div>
                      </div>
                      <div className="space-y-1 text-right">
                        <div className="text-xs font-medium text-foreground">
                          {selectedZone?.name ?? booking.zone}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {booking.feePerEntry ? (
                            <>
                              {ticketsToCharge} × ฿
                              {booking.feePerEntry.toLocaleString()}
                            </>
                          ) : (
                            <>
                              {ticketsToCharge} ใบ × (฿
                              {(selectedZone?.price ?? 0).toLocaleString()} +{" "}
                              {booking.serviceFee.toLocaleString()})
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
                  disabled={!canSubmit}
                  asChild
                >
                  <Link href="/tracking">
                    ยืนยันข้อมูล
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                {!canSubmit && (
                  <p className="text-center text-xs text-muted-foreground">
                    กรุณาเลือกโซนและกรอกข้อมูลให้ครบก่อนยืนยัน
                  </p>
                )}
              </Card>
            )}
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
